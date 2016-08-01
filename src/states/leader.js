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
    let majorityVoted = false
    let voteCount = 1
    let commitCount = 1
    const done = _done || noop

    this._resetAppendEntriesTimeout()

    const log = this._node.log
    const lastEntry = log.head()
    const currentTerm = this._node.state.term()

    this._node.network.peers.forEach(peer => {
      debug('sending AppendEntries to %s', peer)

      const entries = this._entriesForFollower(peer)
      debug('entries for %s are: %j', peer, entries)
      const firstEntry = entries.length && entries[0]
      const leaderCommit = log._commitIndex

      const appendEntriesArgs = {
        term: currentTerm,
        leaderId: this._node.state.id,
        prevLogIndex: firstEntry && (firstEntry.i - 1) || 0,
        prevLogTerm: firstEntry && firstEntry.t || 0,
        entries,
        leaderCommit
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
          } else if (reply && reply.params) {
            if (reply.params.success) {
              commitCount++
              this._setMatchIndex(peer, leaderCommit)
              if (lastEntry) {
                this._setNextIndex(peer, lastEntry.i + 1)
              }
            } else {
              if (reply.params.lastIndexForTerm) {
                this._setNextIndex(peer, reply.params.lastIndexForTerm)
              } else {
                this._decrementNextIndex(peer)
              }
            }
          }

          if (!majorityVoted) {
            majorityVoted = this._node.network.isMajority(voteCount)
            if (majorityVoted) {
              debug('%s: majority has voted', this._node.state.id)
              if (this._node.network.isMajority(commitCount)) {
                debug('%s: majority reached', this._node.state.id)
                if (lastEntry) {
                  debug('%s: about to commit index %d', this._node.state.id, lastEntry.i)
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
      )
    })
  }

  _resetAppendEntriesTimeout () {
    if (this._appendEntriesInterval) {
      timers.clearTimeout(this._appendEntriesInterval)
    }

    this._appendEntriesTimeout = timers.setTimeout(
      this.appendEntries.bind(this),
      this._options.appendEntriesIntervalMS)
  }

  _ensureFollowers () {
    const nextIndex = this._node.log._lastLogIndex + 1
    this._node.network.peers.forEach(address => {
      const follower = this._followers[address]
      if (!follower) {
        this._followers[address] = {
          nextIndex,
          matchIndex: 0
        }
      }
    })
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

}

module.exports = Leader

function noop () {}
