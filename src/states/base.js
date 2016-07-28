'use strict'

const debug = require('debug')('skiff.states.base')
const merge = require('deepmerge')
const timers = require('timers')

const defaultOptions = {
  appendEntriesIntervalMS: 100,
  electionTimeoutMinMS: 150,
  electionTimeoutMaxMS: 300
}

class Base {

  constructor (node, options) {
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
    const logIndexIsAcceptable = message.params.lastLogIndex >= this._node.state.lastLogIndex()
    const voteGranted = termIsAcceptable && votedForIsAcceptable && logIndexIsAcceptable

    if (!voteGranted) {
      debug('%s: vote was not granted because: %j', this._node.state.id, {
        termIsAcceptable, votedForIsAcceptable, logIndexIsAcceptable
      })
    }

    return voteGranted
  }

  _appendEntriesReceived (message, done) {
    let success = false
    let reason
    const currentTerm = this._node.state.term()
    const termIsAcceptable = (message.params.term >= currentTerm)
    if (!termIsAcceptable) {
      reason = 'term is not acceptable'
      debug('term is not acceptable')
    }

    if (message.params.leaderCommit > this._node.state.commitIndex()) {
      this._node.state.commitIndex(message.params.leaderCommit)
    }

    success = termIsAcceptable // TODO: other conditions

    this._node.network.reply(
      message.from,
      message.id,
      {
        term: this._node.state.term(),
        success,
        reason
      }, done)

    if (success) {
      this._resetElectionTimeout()
      this._node.state.transition('follower')
    }
  }
}

module.exports = Base
