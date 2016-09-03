'use strict'

const debug = require('debug')('skiff.states.leader')
const timers = require('timers')

const Base = require('./base')
const BatchTransformStream = require('../lib/batch-transform-stream')

class Leader extends Base {

  start () {
    this._followers = {}
    this._ensureFollowers()
    this.appendEntries()
  }

  stop () {
    if (this._appendEntriesTimeout) {
      timers.clearTimeout(this._appendEntriesTimeout)
    }
  }

  command (command, options, done) {
    this._node.log.push(command)
    this._ensureFollowers()
    this.appendEntries(done)
  }

  readConsensus (callback) {
    // TODO: grant consensus if timestamp for last consensus < minimium election timeout
    this.appendEntries(callback)
  }

  appendEntries (_done) {
    const self = this
    let majorityVoted = false
    let voteCount = 1
    let commitCount = 1
    const done = _done || noop

    this._resetAppendEntriesTimeout()

    const log = this._node.log
    const lastEntry = log.head()

    this._node.network.peers
      .map(this._ensureFollower.bind(this))
      .filter(peer => !peer.installingSnapshot)
      .forEach(peer => {
        this._appendEntriesToPeer(peer.id, err => {
          voteCount++
          if (!err) {
            commitCount++
          }
          perhapsDone()
        })
      })

    function perhapsDone () {
      if (!majorityVoted) {
        majorityVoted = self._node.network.isMajority(voteCount)
        if (majorityVoted) {
          debug('%s: majority has voted', self._node.state.id)
          if (self._node.network.isMajority(commitCount)) {
            debug('%s: majority reached', self._node.state.id)
            if (lastEntry) {
              debug('%s: about to commit index %d', self._node.state.id, lastEntry.i)
              log.commit(lastEntry.i, done)
            } else {
              done()
            }
          } else {
            const err = new Error('No majority reached')
            err.code = 'ENOMAJORITY'
            done(err)
          }
        }
      }
    }
  }

  _appendEntriesToPeer (peer, done) {
    debug('sending AppendEntries to %s', peer)

    const peerInfo = this._ensureFollower(peer)

    if (peerInfo.installingSnapshot) {
      return done()
    }

    const log = this._node.log
    const currentTerm = this._node.state.term()

    const entries = this._entriesForFollower(peer)
    if (entries) {
      debug('%s: entries for %s are: %j', this._node.state.id, peer, entries)

      if (peerInfo.appendingEntries) {
        return done()
      }

      peerInfo.appendingEntries = true
      const previousEntry = this._previousEntryForFollower(peer)
      const lastEntry = entries[entries.length - 1]
      const leaderCommit = log._commitIndex

      const appendEntriesArgs = {
        term: currentTerm,
        leaderId: this._node.state.id,
        prevLogIndex: previousEntry && previousEntry.i || 0,
        prevLogTerm: previousEntry && previousEntry.t || 0,
        entries,
        leaderCommit
      }

      this._node.network.rpc(
        {
          to: peer,
          action: 'AppendEntries',
          params: appendEntriesArgs
        },
        (err, reply) => { // callback
          peerInfo.appendingEntries = false
          debug('%s: got reply to AppendEntries from %s: %j', this._node.state.id, peer, reply)
          if (err) {
            debug('%s: error on AppendEntries reply:\n%s', this._node.state.id, err.stack)

            // not sure what to do in this error condition
            // retry?
            // calling back with error for now...
            done(err)
          } else if (reply && reply.params) {
            if (reply.params.success) {
              this._setMatchIndex(peer, leaderCommit)
              if (lastEntry) {
                this._setNextIndex(peer, lastEntry.i + 1)
              }
              done()
            } else {
              if (reply.params.lastIndexForTerm !== undefined) {
                this._setNextIndex(peer, reply.params.lastIndexForTerm + 1)
              } else {
                this._decrementNextIndex(peer)
              }

              // again

              this._appendEntriesToPeer(peer, done)
            }
          } else {
            done(new Error('No reply params from peer'))
          }
        }
      )
    } else {
      // no log entries for peer that's lagging behind
      debug('%s: peer %s is lagging behind (next index is %d), going to install snapshot',
        this._node.state.id, peer, peerInfo.nextIndex)
      peerInfo.appendingEntries = false
      this._installSnapshot(peer, done)
    }
  }

  _resetAppendEntriesTimeout () {
    if (this._appendEntriesInterval) {
      timers.clearTimeout(this._appendEntriesInterval)
    }

    debug('%s: setting the append entries timeout to %d ms',
      this._node.state.id, this._options.appendEntriesIntervalMS)

    this._appendEntriesTimeout = timers.setTimeout(
      this._onAppendEntriesTimeout.bind(this),
      this._options.appendEntriesIntervalMS)
  }

  _onAppendEntriesTimeout () {
    debug('%s: AppendEntries timedout', this._node.state.id)
    this.appendEntries()
  }

  _ensureFollowers () {
    this._node.network.peers.forEach(address => {
      this._ensureFollower(address)
    })
  }

  _ensureFollower (address) {
    let follower = this._followers[address]
    if (!follower) {
      follower = this._followers[address] = {
        id: address,
        nextIndex: this._node.log._lastLogIndex + 1,
        matchIndex: 0,
        installingSnapshot: false
      }
    }
    return follower
  }

  _setNextIndex (address, nextIndex) {
    debug('%s: setting next index for %s to %d', this._node.state.id, address, nextIndex)
    this._followers[address].nextIndex = nextIndex
  }

  _decrementNextIndex (address) {
    this._followers[address].nextIndex--
  }

  _setMatchIndex (address, matchIndex) {
    this._followers[address].matchIndex = matchIndex
  }

  _entriesForFollower (address) {
    const follower = this._followers[address]
    debug('follower %s next index is %d', address, follower.nextIndex)
    const start = follower.nextIndex
    let entries = this._node.log.entriesFrom(start)
    if (entries) {
      entries = entries.slice(0, this._options.batchEntriesLimit)
    }
    return entries
  }

  _previousEntryForFollower (address) {
    const follower = this._followers[address]
    if (follower.nextIndex > 1) {
      return this._node.log.atLogIndex(follower.nextIndex - 1)
    }
  }

  // Install snapshot

  _installSnapshot (peer, _done) {
    debug('%s: _installSnapshot on %s', this._node.state.id, peer)

    const self = this
    let finished = false
    let offset = 0

    const follower = this._followers[peer]
    follower.installingSnapshot = true

    const lastIncluded = this._node.state.log.lastAppliedEntry()

    const rs = this._node.state.db.state.createReadStream()
    const stream = rs.pipe(
      new BatchTransformStream({
        batchSize: this._options.installSnapshotChunkSize
      })
    )

    stream.on('data', installSnapshot)

    function installSnapshot (data) {
      debug('%s: have chunks %j, finished = %j', self._node.state.id, data.chunks, data.finished)
      stream.pause()

      const installSnapshotArgs = {
        term: self._node.state.term(),
        leaderId: self._node.id,
        lastIncludedIndex: lastIncluded.i,
        lastIncludedTerm: lastIncluded.t,
        offset,
        data: data.chunks,
        done: data.finished
      }

      offset += data.chunks.length

      self._node.network.rpc(
        {
          to: peer,
          action: 'InstallSnapshot',
          params: installSnapshotArgs
        },
        (err, reply) => { // callback
          debug('%s: got InstallSnapshot reply', self._node.state.id, err, reply)
          if (err) {
            done(err)
          } else {
            if (data.finished) {
              debug('%s: data finished, setting next index of %j to %d',
                self._node.state.id, follower, lastIncluded.i)
              follower.nextIndex = follower.matchIndex = lastIncluded.i
              debug('setting next index of %j to %d', follower, lastIncluded.i)
              done()
            } else {
              debug('resuming stream...')
              stream.resume()
            }
          }
        }
      )

      debug('%s: sent InstallSnapshot', self._node.state.id)
    }

    function done (err) {
      if (!finished) {
        finished = true
        follower.installingSnapshot = false
        rs.destroy()
        _done(err)
      }
    }
  }
}

module.exports = Leader

function noop () {}
