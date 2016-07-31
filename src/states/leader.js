'use strict'

const debug = require('debug')('skiff.states.candidate')
const timers = require('timers')

const Base = require('./base')

class Leader extends Base {

  start () {
    this._broadcastAppendEntries()
  }

  stop () {
    if (this._appendEntriesTimeout) {
      timers.clearTimeout(this._appendEntriesTimeout)
    }
  }

  command (command, _done) {
    let majorityVoted = false
    let voteCount = 0
    let commitCount = 0

    this._resetAppendEntriesTimeout()

    const log = this._node.state.log
    const prevEntry = log.head()
    const index = this._node.log.push(command)

    this._node.network.peers.forEach(peer => {
      debug('sending AppendEntries to %s', peer)
      const appendEntriesArgs = {
        term: this._node.state.term(),
        leaderId: this._node.state.id,
        prevLogTerm: prevEntry && prevEntry.t,
        prevLogIndex: prevEntry && prevEntry.i,
        entries: [log.head()]
      }

      this._node.network.rpc(
        peer, // to
        'AppendEntries', // action
        appendEntriesArgs, // params
        (err, reply) => { // callback
          voteCount++
          if (err) {
            debug('error on AppendEntries reply:\n%s', err.stack)
          }
          if (!err && !majorityVoted) {
            debug('reply for request vote from %s: err = %j, message = %j', peer, err, reply)
            if (reply && reply.params.success) {
              commitCount++
            }
          }

          if (! majorityVoted) {
            majorityVoted = this._node.network.isMajority(voteCount)
            if (majorityVoted) {
              if (this._node.network.isMajority(voteCount)) {
                this._node.log.commit(index, done)
              } else {
                const err = new Error('No majority reached')
                err.code = 'ENOMAJORITY'
                done(err)
              }
            }
          }
        }
      )
    })
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
