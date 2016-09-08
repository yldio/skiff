'use strict'

const debug = require('debug')('skiff.peer-leader')
const timers = require('timers')

const BatchTransformStream = require('./lib/batch-transform-stream')

class PeerLeader {

  constructor (address, node, options) {
    if (typeof address !== 'string') {
      throw new Error('need address to be a string')
    }
    this._address = address
    this._node = node
    this._options = options
    this._nextIndex = this._node.log._lastLogIndex + 1
    this._matchIndex = 0
    this._installingSnapshot = false

    this._setAppendEntriesTimeout()
  }

  stop () {
    this._clearAppendEntriesTimeout()
  }

  appendEntries (_done) {
    debug('sending AppendEntries to %s', this._address)

    const done = _done || noop

    if (this._installingSnapshot) {
      return done()
    }

    this._resetAppendEntriesTimeout()

    const log = this._node.log
    const currentTerm = this._node.state.term()

    const entriesReply = this._entries()
    const entries = entriesReply.entries
    const capped = entriesReply.capped
    if (entries) {
      debug('%s: entries for %s are: %j', this._node.state.id, this._address, entries)

      const previousEntry = this._previousEntry()
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

      return this._node.network.rpc(
        {
          to: this._address,
          action: 'AppendEntries',
          params: appendEntriesArgs,
          timeout: 10000
        },
        (err, reply) => { // callback
          debug('%s: got reply to AppendEntries from %s: %j', this._node.state.id, this._address, reply)
          if (err) {
            debug('%s: error on AppendEntries reply:\n%s', this._node.state.id, err.stack)

            // not sure what to do in this error condition
            // retry?
            // calling back with error for now...
            done(err)
          } else if (reply && reply.params) {
            if (reply.params.success) {
              this._matchIndex = leaderCommit
              if (lastEntry) {
                this._nextIndex = lastEntry.i + 1
              }
              if (capped) {
                this.appendEntries(done)
              } else {
                done(null, reply.params)
              }
            } else {
              if (reply.params.lastIndexForTerm !== undefined) {
                this._nextIndex = reply.params.lastIndexForTerm
              } else {
                this._nextIndex --
              }

              // again

              process.nextTick(() => {
                this.appendEntries(done)
              })
            }
          } else {
            done(new Error('No reply params from peer'))
          }
        }
      )
    } else {
      // no log entries for peer that's lagging behind
      debug('%s: peer %s is lagging behind (next index is %d), going to install snapshot',
        this._node.state.id, this._address, this._nextIndex)
      return this._installSnapshot(done)
    }
  }

  _clearAppendEntriesTimeout () {
    if (this._appendEntriesTimeout) {
      timers.clearTimeout(this._appendEntriesTimeout)
    }
    this._appendEntriesTimeout = null
  }

  _setAppendEntriesTimeout () {
    debug('%s: setting the append entries timeout to %d ms',
      this._node.state.id, this._options.appendEntriesIntervalMS)

    this._appendEntriesTimeout = timers.setTimeout(
      this._onAppendEntriesTimeout.bind(this),
      this._options.appendEntriesIntervalMS)
  }

  _resetAppendEntriesTimeout () {
    this._clearAppendEntriesTimeout()
    this._setAppendEntriesTimeout()
  }

  _onAppendEntriesTimeout () {
    debug('%s: AppendEntries timedout', this._node.state.id)
    this.appendEntries()
  }

  _entries () {
    debug('follower %s next index is %d', this._address, this._nextIndex)
    const start = this._nextIndex
    let entries = this._node.log.entriesFrom(start)
    const cap = entries && entries.length > this._options.batchEntriesLimit
    if (cap) {
      entries = entries.slice(0, this._options.batchEntriesLimit)
    }
    return { capped: cap, entries }
  }

  _previousEntry () {
    return this._node.log.atLogIndex(this._nextIndex - 1)
  }

  // Install snapshot

  _installSnapshot (_done) {
    debug('%s: _installSnapshot on %s', this._node.state.id, this._address)

    const self = this

    this._clearAppendEntriesTimeout()
    let finished = false
    let offset = 0

    this._installingSnapshot = true

    const lastIncluded = this._node.state.log.lastAppliedEntry()

    const rs = this._node.state.db.state.createReadStream()
    const stream = rs.pipe(
      new BatchTransformStream({
        batchSize: this._options.installSnapshotChunkSize
      })
    )

    stream.on('data', installSnapshot)

    return cancel

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
          to: self._address,
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
                self._node.state.id, self._address, lastIncluded.i)
              self._nextIndex = self._matchIndex = lastIncluded.i
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
        cancel()
        _done(err)
      }
    }

    function cancel () {
      self._installingSnapshot = false
      self._resetAppendEntriesTimeout()
      rs.destroy()
    }
  }
}

module.exports = PeerLeader

function noop () {}
