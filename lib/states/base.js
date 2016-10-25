'use strict'

const debug = require('debug')('skiff.states.base')
const timers = require('timers')
const EventEmitter = require('events')
const async = require('async')

class Base extends EventEmitter {

  constructor (node, options) {
    super()
    this.id = node.id
    this._node = node
    this._options = options
    this._stopped = true
  }

  start () {
    this._stopped = false
    this._resetElectionTimeout()
  }

  stop () {
    this._stopped = true
    this._clearElectionTimeout()
  }

  _clearElectionTimeout () {
    if (this._electionTimeout) {
      timers.clearTimeout(this._electionTimeout)
    }
    this._electionTimeout = null
  }

  _setElectionTimeout () {
    if (this._stopped) {
      return
    }

    if (this._options.electionTimeout) {
      this._electionTimeout = timers.setTimeout(
        this._onElectionTimeout.bind(this),
        this._randomElectionTimeout())
    }
  }

  _resetElectionTimeout () {
    debug('%s: resetting election timeout', this.id)
    this._clearElectionTimeout()
    this._setElectionTimeout()
  }

  _onElectionTimeout () {
    debug('%s: election timeout', this.id)
    this.emit('election timeout')
    this._electionTimeout = undefined
    this._node.state.transition('candidate', true)
  }

  _randomElectionTimeout () {
    const min = this._options.electionTimeoutMinMS
    const max = this._options.electionTimeoutMaxMS
    return min + Math.floor(Math.random() * (max - min))
  }

  handleRequest (message, done) {
    debug('%s: handling request %j', this.id, message)

    switch (message.action) {

      case 'AppendEntries':
        this._appendEntriesReceived(message, done)
        break

      case 'RequestVote':
        this._requestVoteReceived(message)
        done()
        break

      case 'InstallSnapshot':
        this._installSnapshotReceived(message, done)
        break

      case 'Command':
        this._handleCommand(message, done)
        break

      default:
        if (this._handleRequest) {
          this._handleRequest(message, done)
        } else {
          debug('%s: not handling message %j', this.id, message)
          done()
        }
    }
  }

  _handleCommand (message, done) {
    done()
    debug('handling command %j', message)
    this._node.command(message.params.command, message.params.options, (err, result) => {
      const currentTerm = this._node.state.term()
      if (err) {
        this._node.network.reply(
          message.from,
          message.id,
          {
            replyTo: 'Command',
            term: currentTerm,
            error: {
              message: err.message,
              code: err.code,
              leader: this._node.leader()
            }
          })
      } else {
        this._node.network.reply(
          message.from,
          message.id,
          {
            replyTo: 'Command',
            term: currentTerm,
            result
          })
      }
    })
  }

  _requestVoteReceived (message, done) {
    debug('%s: request vote received: %j', this.id, message)

    const voteGranted = this._perhapsGrantVote(message)

    if (voteGranted) {
      debug('vote granted')
      this._node.state.setVotedFor(message.from)
      this._resetElectionTimeout()
      this._node.state.transition('follower', true)
    }

    this._node.network.reply(
      message.from,
      message.id,
      {
        term: this._node.state.term(),
        voteGranted
      }, done)
  }

  _perhapsGrantVote (message) {
    debug('%s: perhaps grant vote to %j', this.id, message)
    const currentTerm = this._node.state.term()
    debug('%s: current term is: %d', this.id, currentTerm)
    const votedFor = this._node.state.getVotedFor()
    const termIsAcceptable = (message.params.term >= currentTerm)
    const votedForIsAcceptable = (currentTerm < message.params.term) || !votedFor || (votedFor === message.from)
    const logIndexIsAcceptable = (message.params.lastLogIndex >= this._node.log._lastLogIndex)

    const voteGranted = termIsAcceptable && votedForIsAcceptable && logIndexIsAcceptable

    if (!voteGranted) {
      debug('%s: vote was not granted because: %j', this.id, {
        termIsAcceptable, votedForIsAcceptable, logIndexIsAcceptable
      })
    }

    return voteGranted
  }

  _appendEntriesReceived (message, done) {
    const self = this
    const log = this._node.log
    const params = message.params || {}

    let success = false
    let entry
    let reason
    let prevLogMatches = false
    let commitIndex = this._node.log._commitIndex
    const currentTerm = this._node.state.term()
    const termIsAcceptable = (params.term >= currentTerm)
    if (!termIsAcceptable) {
      reason = 'term is not acceptable'
      debug('term is not acceptable')
    }

    if (termIsAcceptable) {
      this._resetElectionTimeout()
      debug('%s: term is acceptable', this.id)
      entry = log.atLogIndex(params.prevLogIndex)
      debug('%s: entry at previous log index: %j', this.id, entry)
      prevLogMatches =
        (!params.prevLogIndex) ||
        (!entry && (log._lastLogIndex === params.prevLogIndex && log._lastLogTerm === params.prevLogTerm)) ||
        (entry && entry.t === params.prevLogTerm && entry.i === params.prevLogIndex)

      debug('%s: previous log matches: %j', this.id, prevLogMatches)
      if (!prevLogMatches) {
        reason = `prev log term or index does not match: ${
          entry
            ? `prevLogIndex was ${entry.i} and prevLogTerm was ${entry.t}`
            : `no existing last entry. last log index is ${log._lastLogIndex} and last log term is ${log._lastLogTerm}`
          }`

        debug(
          '%s: %s',
          this.id,
          reason)
        debug('%s: last log index: %j, last log term: %j', this.id, log._lastLogIndex, log._lastLogTerm)
      } else {
        success = true
        const newEntries = message.params.entries
        log.appendAfter(message.params.prevLogIndex || 0, newEntries)
        const leaderCommit = message.params.leaderCommit
        if (leaderCommit > commitIndex) {
          commitIndex = leaderCommit
        }
      }
    }

    debug('%s: AppendEntries success? %j', this.id, success)

    if (success && commitIndex > 0) {
      this._node.log.commit(commitIndex, (err) => {
        if (err) {
          success = false
          reason = err.message
        }
        reply()
      })
    } else {
      reply()
    }

    function reply () {
      let nextLogIndex = 0
      if (!success && entry) {
        nextLogIndex = log.lastIndexForTerm(entry.t)
      } else if (success) {
        nextLogIndex = log._lastLogIndex + 1
      }
      self._node.network.reply(
        message.from,
        message.id,
        {
          replyTo: 'AppendEntries',
          term: currentTerm,
          nextLogIndex,
          success,
          reason
        }, done)

      debug('AppendEntries replied with success = %j to %s', success, message.from)

      if (termIsAcceptable) {
        self._resetElectionTimeout()
      }

      if (success) {
        self._node.state.transition('follower')
      }
    }
  }

  _installSnapshotReceived (message, done) {
    debug('%s: _installSnapshotReceived %j', this.id, message)

    this._resetElectionTimeout()

    const self = this
    const tasks = []
    const db = this._node.state.db.state

    if (message.params.offset === 0) {
      tasks.push(db.clear.bind(db))
    }

    if (message.params.done) {
      const log = this._node.state.log
      log._lastLogIndex = message.params.lastIncludedIndex
      log._commitIndex = message.params.lastIncludedIndex
      log._lastApplied = message.params.lastIncludedIndex
      log._lastLogTerm = message.params.lastIncludedTerm
      log._lastAppliedTerm = message.params.lastIncludedTerm
      if (message.params.peers) {
        this._node.network.setPeers(message.params.peers)
      }
    }

    tasks.push(insertData)
    tasks.push(reply)

    async.series(tasks, done)

    function insertData (cb) {
      const data = message.params.data
      if (!data || !data.length) {
        cb()
      } else {
        db.batch(data, cb)
      }
    }

    function reply (cb) {
      self._node.network.reply(
        message.from,
        message.id,
        {
          replyTo: 'InstallSnapshot',
          term: self._node.state.term()
        },
        cb)

      self._resetElectionTimeout()
    }
  }

  join () {}
  leave () {}

}

module.exports = Base
