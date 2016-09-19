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
    this._appendingEntries = false
    this._needsMore = true
    this._installingSnapshot = false
    this._lastSent = 0
    this._stopped = false

    this._waiting = []

    this._schedule()
  }

  stop () {
    this._stopped = true
    this._clearAppendEntriesTimeout()
  }

  waitForEntryAppended (index, maxTime, callback) {
    const wait = {index, maxTime, notified: false, callback}
    this._waiting.push(wait)
    this._appendEntries()

    return () => {
      this._waiting = this._waiting.filter(waiting => waiting !== wait)
    }
  }

  _notifyWaiting (index) {
    const now = Date.now()
    this._waiting
      .filter(waiting => ((waiting.index <= index) && (!waiting.notified)))
      .forEach(waiting => {
        let err
        waiting.notified = true
        if (waiting.maxTime < now) {
          err = new Error('timed out')
          err.code = 'ETIMEOUT'
        }
        waiting.callback.call(null, err)
      })

    timers.setImmediate(this._cleanNotifiedWaiting.bind(this))
  }

  _cleanNotifiedWaiting () {
    this._waiting = this._waiting.filter(waiting => !waiting.notified)
  }

  _appendEntries () {
    debug('sending AppendEntries to %s', this._address)

    if (this._stopped) {
      return
    }

    if (this._installingSnapshot) {
      this._resetAppendEntriesTimeout()
      return
    }

    if (this._appendingEntries) {
      this._needsMore = true
      return
    }

    this._appendingEntries = true

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

      this._lastSent = Date.now()

      this._resetAppendEntriesTimeout()

      this._node.network.rpc(
        {
          to: this._address,
          action: 'AppendEntries',
          params: appendEntriesArgs
        },
        (err, reply) => { // callback
          this._appendingEntries = false
          debug('%s: got reply to AppendEntries from %s: %j', this._node.state.id, this._address, reply)
          if (err) {
            debug('%s: error on AppendEntries reply:\n%s', this._node.state.id, err.stack)
          } else if (reply && reply.params) {
            if (reply.params.success) {
              this._matchIndex = leaderCommit
              if (lastEntry) {
                this._nextIndex = lastEntry.i + 1
              }
              if (capped) {
                this._needsMore = true
              }
              const commitedEntry = lastEntry || previousEntry
              const commitedIndex = commitedEntry && commitedEntry.i || 0
              if (commitedIndex) {
                this._notifyWaiting(commitedIndex)
              }
            } else {
              if (reply.params.lastIndexForTerm !== undefined) {
                this._nextIndex = reply.params.lastIndexForTerm + 1
              } else {
                this._nextIndex --
              }

              this._needsMore = true
            }
            if (this._needsMore) {
              this._schedule()
            }
          }
        }
      )
    } else {
      // no log entries for peer that's lagging behind
      debug('%s: peer %s is lagging behind (next index is %d), going to install snapshot',
        this._node.state.id, this._address, this._nextIndex)

      this._appendingEntries = false
      this._resetAppendEntriesTimeout()
      return this._installSnapshot()
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

  _schedule () {
    if (this._needsMore) {
      this._needsMore = false
      timers.setImmediate(this._appendEntries.bind(this))
    } else {
      this._resetAppendEntriesTimeout()
    }
  }

  _onAppendEntriesTimeout () {
    debug('%s: AppendEntries timedout', this._node.state.id)
    this._appendEntries()
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

  _installSnapshot () {
    debug('%s: _installSnapshot on %s', this._node.state.id, this._address)

    if (this._stopped) {
      return
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
            cleanup()
          } else {
            if (data.finished) {
              debug('%s: data finished, setting next index of %j to %d',
                self._node.state.id, self._address, lastIncludedIndex)
              self._nextIndex = self._matchIndex = lastIncludedIndex
              cleanup()
              this._notifyWaiting(lastIncludedIndex)
            } else {
              debug('resuming stream...')
              stream.resume()
            }
          }
        }
      )

      debug('%s: sent InstallSnapshot', self._node.state.id)
    }

    function cleanup () {
      if (!finished) {
        finished = true
        self._installingSnapshot = false
        self._resetAppendEntriesTimeout()
        rs.destroy()
      }
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
