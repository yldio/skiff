'use strict'

const timers = require('timers')

const Base = require('./base')

class Leader extends Base {

  start () {
    this._resetAppendEntriesTimeout()
  }

  stop () {
    if (this._appendEntriesTimeout) {
      timers.clearTimeout(this._appendEntriesTimeout)
    }
  }

  _resetAppendEntriesTimeout () {
    if (this._appendEntriesInterval) {
      timers.clearTimeout(this._appendEntriesInterval)
    }

    this._appendEntriesTimeout = timers.setTimeout(
      this._broadcastAppendEntries.bind(this),
      this._options.appendEntriesIntervalMS)
  }

  _broadcastAppendEntries () {
    this._resetAppendEntriesTimeout()

    const appendEntriesOptions = {
      term: this._node.state.term(),
      leaderId: this._node.state.id,
      prevLogIndex: this._node.state.lastLogIndex(), // TODO
      entries: [], // TODO
      leaderCommit: this._node.state.commitIndex()
    }

    this._node.network.peers.forEach(peer => {
      this._node.network.rpc(
        peer, // to
        'AppendEntries', // action
        appendEntriesOptions, // options
        (err, result) => {
          if (!err && result) {
            // TODO: process result
          }
        }
      )
    })
  }

}

module.exports = Leader
