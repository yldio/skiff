'use strict'

const debug = require('debug')('skiff.states.leader')
const timers = require('timers')

const Base = require('./base')

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

  command (command, done) {
    this._node.log.push(command)
    this._ensureFollowers()
    this.appendEntries(done)
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

    this._node.network.peers.forEach(peer => {
      this._appendEntriesToPeer(peer, err => {
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

    this._ensureFollower(peer)

    const log = this._node.log
    const currentTerm = this._node.state.term()

    const entries = this._entriesForFollower(peer)
    debug('entries for %s are: %j', peer, entries)
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
      peer, // to
      'AppendEntries', // action
      appendEntriesArgs, // params
      (err, reply) => { // callback
        debug('got reply to AppendEntries from %s: %j', peer, reply)
        if (err) {
          debug('error on AppendEntries reply:\n%s', err.stack)

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
              this._setNextIndex(peer, reply.params.lastIndexForTerm)
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
    const nextIndex = this._node.log._lastLogIndex + 1
    const follower = this._followers[address]
    if (!follower) {
      this._followers[address] = {
        nextIndex,
        matchIndex: 0
      }
    }
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
    return this._node.log.entriesFrom(follower.nextIndex)
  }

  _previousEntryForFollower (address) {
    const follower = this._followers[address]
    if (follower.nextIndex > 1) {
      return this._node.log.atLogIndex(follower.nextIndex - 1)
    }
  }

}

module.exports = Leader

function noop () {}
