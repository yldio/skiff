'use strict'

const debug = require('debug')('skiff.peer-leader')
const timers = require('timers')
const once = require('once')

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
    this._lastSent = 0
    this._halfAppendEntriesIntervalMS = Math.round(
      this._options.appendEntriesIntervalMS / 2)

    this._setAppendEntriesTimeout()
    this._stopped = false
  }

  stop () {
    this._stopped = true
    this._clearAppendEntriesTimeout()
  }

  appendEntries (_done) {
    debug('sending AppendEntries to %s', this._address)

    const done = once(_done || noop)

    if (this._stopped) {
      return done(new Error('stopped'))
    }

    if (this._installingSnapshot) {
      this._resetAppendEntriesTimeout()
      return done()
    }

    const log = this._node.log
    const currentTerm = this._node.state.term()

    const entriesReply = this._entries()
    const entries = entriesReply.entries
    const capped = entriesReply.capped
    if (entries) {
      debug('%s: entries for %s are: %j', this._node.state.id, this._address, entries)

      const timeSinceLastSent = Date.now() - this._lastSent

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

      this._lastSent = Date.now()

      this._resetAppendEntriesTimeout()

      return this._node.network.rpc(
        {
          to: this._address,
          action: 'AppendEntries',
          params: appendEntriesArgs
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
                done(null, reply.params.success, reply.params.reason)
              }
            } else {
              if (reply.params.lastIndexForTerm !== undefined) {
                this._nextIndex = reply.params.lastIndexForTerm + 1
              } else {
                this._nextIndex --
              }

              // again

              timers.setImmediate(this.appendEntries.bind(this, done))
            }
          } else {
            done(new Error('No reply params from peer'), false, 'no reply')
          }
        }
      )
    } else {
      // no log entries for peer that's lagging behind
      debug('%s: peer %s is lagging behind (next index is %d), going to install snapshot',
        this._node.state.id, this._address, this._nextIndex)

      this._resetAppendEntriesTimeout()
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
    const cap = entries && (entries.length > this._options.batchEntriesLimit)
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

    if (this._stopped) {
      return done(new Error('stopped'))
    }

    const self = this

    this._clearAppendEntriesTimeout()
    let finished = false
    let offset = 0

    this._installingSnapshot = true

    const lastIncludedIndex = this._node.state.log._lastLogIndex
    const lastIncludedTerm = this._node.state.log._lastLogTerm

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
        lastIncludedIndex,
        lastIncludedTerm,
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
                self._node.state.id, self._address, lastIncludedIndex)
              self._nextIndex = self._matchIndex = lastIncludedIndex
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

  state () {
    return {
      address: this._address,
      stopped: this._stopped,
      nextIndex: this._nextIndex,
      matchIndex: this._matchIndex,
      installingSnapshot: this._installingSnapshot,
      sentAppendEntriesAgoMS: Date.now() - this._lastSent
    }
  }
}

module.exports = PeerLeader

function noop () {}
