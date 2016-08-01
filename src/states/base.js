'use strict'

const debug = require('debug')('skiff.states.base')
const merge = require('deepmerge')
const timers = require('timers')
const EventEmitter = require('events')

const defaultOptions = {
  appendEntriesIntervalMS: 100,
  electionTimeoutMinMS: 150,
  electionTimeoutMaxMS: 300
}

class Base extends EventEmitter {

  constructor (node, options) {
    super()
    this._node = node
    this._options = merge(options, defaultOptions)
  }

  start () {
    this._resetElectionTimeout()
    if (this._start) {
      this._start()
    }
  }

  stop () {
    timers.clearTimeout(this._electionTimeout)
    if (this._stop) {
      this._stop()
    }
  }

  _resetElectionTimeout () {
    debug('%s: resetting election timeout', this._node.state.id)
    if (this._electionTimeout) {
      timers.clearTimeout(this._electionTimeout)
    }

    this._electionTimeout = timers.setTimeout(
      this._onElectionTimeout.bind(this),
      this._randomElectionTimeout())
  }

  _onElectionTimeout () {
    debug('%s: election timeout', this._node.state.id)
    this._electionTimeout = undefined
    if (this._node.network.peers.length) {
      this._node.state.incrementTerm()
      this._node.state.transition('candidate', true)
    }
  }

  _randomElectionTimeout () {
    const diff = this._options.electionTimeoutMaxMS - this._options.electionTimeoutMinMS
    const rnd = Math.floor(Math.random() * diff)
    return this._options.electionTimeoutMinMS + rnd
  }

  handleRequest (message, done) {
    debug('%s: handling request %j', this._node.state.id, message)

    switch (message.action) {

      case 'AppendEntries':
        this._appendEntriesReceived(message, done)
        break

      case 'RequestVote':
        this._requestVoteReceived(message)
        done()
        break

      default:
        if (this._handleRequest) {
          this._handleRequest(message, done)
        } else {
          debug('%s: not handling message %j', this._node.state.id, message)
          done()
        }
    }
  }

  _requestVoteReceived (message, done) {
    debug('%s: request vote received: %j', this._node.state.id, message)
    const voteGranted = this._perhapsGrantVote(message)

    if (voteGranted) {
      debug('vote granted')
      this._node.state.setVotedFor(message.from)
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
    debug('%s: perhaps grant vote to %j', this._node.state.id, message)
    const currentTerm = this._node.state.term()
    debug('%s: current term is: %d', this._node.state.id, currentTerm)
    const votedFor = this._node.state.getVotedFor()
    const termIsAcceptable = (message.params.term >= currentTerm)
    const votedForIsAcceptable = !votedFor || (votedFor === message.from)
    const logIndexIsAcceptable = message.params.lastLogIndex >= this._node.log._lastLogIndex
    const voteGranted = termIsAcceptable && votedForIsAcceptable && logIndexIsAcceptable

    if (!voteGranted) {
      debug('%s: vote was not granted because: %j', this._node.state.id, {
        termIsAcceptable, votedForIsAcceptable, logIndexIsAcceptable
      })
    }

    return voteGranted
  }

  _appendEntriesReceived (message, done) {
    const self = this

    let success = false
    let reason
    let prevLogMatches = true
    const currentTerm = this._node.state.term()
    const termIsAcceptable = (message.params.term >= currentTerm)
    if (!termIsAcceptable) {
      reason = 'term is not acceptable'
      debug('term is not acceptable')
    }

    if (termIsAcceptable && message.params.prevLogIndex) {
      const entry = this._node.log.atLogIndex(message.params.prevLogIndex)
      if (entry) {
        prevLogMatches = entry.t === message.params.prevLogTerm
      }
      if (!entry || !prevLogMatches) {
        reason = 'prev log term does not match'
        debug(
          'prev log term does not match. had %d and message contained %d',
          entry && entry.t,
          message.params.prevLogIndex)
      }

      if (prevLogMatches) {
        this._node.log.appendAfter(message.params.prevLogIndex || 0, message.params.entries)
        const leaderCommit = message.params.leaderCommit
        const commitIndex = this._node.log._commitIndex
        if (leaderCommit > commitIndex) {
          this._node.state.commitIndex(Math.min(leaderCommit, commitIndex))
        }
      }
    }

    success = termIsAcceptable && prevLogMatches

    debug('AppendEntries success? %j', success)

    if (success) {
      this._node.log.commit(message.params.leaderCommit || 0, (err) => {
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
      self._node.network.reply(
        message.from,
        message.id,
        {
          replyTo: 'AppendEntries',
          term: self._node.state.term(),
          success,
          reason
        }, done)

      if (success) {
        self._resetElectionTimeout()
        self._node.state.transition('follower')
      }
    }
  }
}

module.exports = Base
