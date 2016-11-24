'use strict'

const debug = require('debug')('skiff.peer-leader')
const timers = require('timers')
const EventEmitter = require('events')

const BatchTransformStream = require('./utils/batch-transform-stream')

class PeerLeader extends EventEmitter {

  constructor (address, node, options) {
    if (typeof address !== 'string') {
      throw new Error('need address to be a string')
    }

    super()

    this._address = address
    this._node = node
    this._options = options
    this._nextIndex = this._node.log._lastLogIndex + 1
    this._matchIndex = 0
    this._needsIndex = 0
    this._installingSnapshot = false
    this._lastSent = 0
    this._stopped = false

    this._appendEntries()
  }

  stop () {
    this._stopped = true
  }

  needsIndex (index) {
    if (index > this._needsIndex) {
      this._needsIndex = index
    }
    if (this._needsMore()) {
      timers.setImmediate(this._appendEntries.bind(this))
    } else {
      timers.setImmediate(() => this.emit('committed', this, index))
    }
  }

  _needsMore () {
    const needs = this._matchIndex < this._needsIndex
    return needs
  }

  _appendEntries () {
    debug('sending AppendEntries to %s', this._address)

    if (this._stopped) {
      return
    }

    if (this._installingSnapshot) {
      return
    }

    const log = this._node.log
    const currentTerm = this._node.state.term()

    const entries = this._entries()
    if (entries) {
      debug('%s: entries for %s are: %j', this._node.state.id, this._address, entries)

      const previousEntry = this._previousEntry()
      const lastEntry = entries[entries.length - 1]
      const leaderCommit = log._commitIndex

      const appendEntriesArgs = {
        term: currentTerm,
        leaderId: this._node.state.id.toString(),
        prevLogIndex: previousEntry && previousEntry.i || 0,
        prevLogTerm: previousEntry && previousEntry.t || 0,
        entries,
        leaderCommit
      }

      this._lastSent = Date.now()

      let replied = false

      this._node.network.rpc(
        {
          to: this._address,
          action: 'AppendEntries',
          params: appendEntriesArgs
        },
        (err, reply) => { // callback
          if (replied) {
            throw new Error('double reply')
          }
          replied = true

          debug('%s: got reply to AppendEntries from %s: %j', this._node.state.id, this._address, reply)
          if (err) {
            debug('%s: error on AppendEntries reply:\n%s', this._node.state.id, err.stack)
          } else if (reply && reply.params) {
            if (reply.params.success) {
              this._matchIndex = leaderCommit
              if (lastEntry) {
                this._matchIndex = Math.min(lastEntry.i, leaderCommit)
                this._nextIndex = lastEntry.i + 1
              }
              const commitedEntry = lastEntry || previousEntry
              const commitedIndex = commitedEntry && commitedEntry.i || 0
              this.emit('committed', this, commitedIndex)
            } else {
              debug('%s: reply next log index is %d', this._node.state.id, reply.params.nextLogIndex)
              if (reply.params.nextLogIndex !== null) {
                this._nextIndex = reply.params.nextLogIndex
              } else if (!reply.fake) {
                this._nextIndex --
              }
            }

            if (!reply.fake && this._needsMore()) {
              timers.setImmediate(this._appendEntries.bind(this))
            } else if (reply.fake) {
              timers.setTimeout(this._appendEntries.bind(this), this._options.appendEntriesIntervalMS)
            }
          }
        }
      )
    } else {
      // no log entries for peer that's lagging behind
      debug('%s: peer %s is lagging behind (next index is %d), going to install snapshot',
        this._node.state.id, this._address, this._nextIndex)

      return this._installSnapshot()
    }
  }

  _entries () {
    debug('follower %s next index is %d', this._address, this._nextIndex)
    let entries = this._node.log.entriesFrom(this._nextIndex)
    if (entries) {
      entries = entries.slice(0, this._options.batchEntriesLimit)
    }
    return entries
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
    const log = this._node.state.log
    const peers = this._node.network.peers()
      .concat(this._node.id.toString())
      .filter(p => p !== this._address.toString())

    let finished = false
    let offset = 0

    this._installingSnapshot = true

    const lastIncludedIndex = log._lastApplied
    const lastIncludedTerm = log._lastAppliedTerm

    const rs = this._node.state.db.state.createReadStream()
    const stream = rs.pipe(
      new BatchTransformStream({
        batchSize: this._options.installSnapshotChunkSize
      })
    )

    stream.on('data', installSnapshot)

    function installSnapshot (data) {
      debug('%s: have chunks %j, finished = %j', self._node.state.id, data.chunks, data.finished)
      debug('%s: installSnapshot on leader: have chunks %j, finished = %j', self._node.state.id, data.chunks, data.finished)
      stream.pause()

      const installSnapshotArgs = {
        term: self._node.state.term(),
        leaderId: self._node.id.toString(),
        lastIncludedIndex,
        lastIncludedTerm,
        offset,
        peers,
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
              self._matchIndex = lastIncludedIndex
              self._nextIndex = lastIncludedIndex + 1
              cleanup()
              this.emit('committed', self, lastIncludedIndex)
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
