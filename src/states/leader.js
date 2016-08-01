'use strict'

const debug = require('debug')('skiff.states.leader')
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

  command (command, done) {
    let majorityVoted = false
    let voteCount = 1
    let commitCount = 1

    this._resetAppendEntriesTimeout()

    const log = this._node.log
    const prevEntry = log.head()
    const index = this._node.log.push(command)

    this._node.network.peers.forEach(peer => {
      debug('sending AppendEntries to %s', peer)
      const appendEntriesArgs = {
        term: this._node.state.term(),
        leaderId: this._node.state.id,
        prevLogTerm: prevEntry && prevEntry.t,
        prevLogIndex: prevEntry && prevEntry.i,
        entries: [log.head()],
        leaderCommit: this._node.log._commitIndex
      }

      this._node.network.rpc(
        peer, // to
        'AppendEntries', // action
        appendEntriesArgs, // params
        (err, reply) => { // callback
          debug('got reply to AppendEntries from %s: %j', peer, reply)
          voteCount++
          if (err) {
            debug('error on AppendEntries reply:\n%s', err.stack)
          } else if (reply && reply.params.success) {
            commitCount++
          }

          if (!majorityVoted) {
            majorityVoted = this._node.network.isMajority(voteCount)
            if (majorityVoted) {
              debug('%s: majority has voted', this._node.state.id)
              if (this._node.network.isMajority(commitCount)) {
                debug('%s: majority reached', this._node.state.id)
                debug('%s: about to commit index %d', this._node.state.id, index)
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
      prevLogIndex: this._node.log._lastLogIndex,
      prevLogTerm: this._node.log._lastLogTerm,
      leaderCommit: this._node.log._commitIndex,
      entries: [] // TODO
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
