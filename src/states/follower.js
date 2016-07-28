'use strict'

const timers = require('timers')

const Base = require('./base')

class Follower extends Base {

  start () {
    this._resetElectionTimeout()
  }

  stop () {
    timers.clearTimeout(this._electionTimeout)
  }

  __handleMessage (message, done) {
    switch (message.action) {
      case 'AppendEntries':
        this._resetElectionTimeout()
        done()
        break

      default:
        done()
        break
    }
  }

  _resetElectionTimeout () {
    if (this._electionTimeout) {
      timers.clearTimeout(this._electionTimeout)
    }

    this._electionTimeout = timers.setTimeout(
      this._onElectionTimeout.bind(this),
      this._options.electionTimeoutMS)
  }

  _onElectionTimeout () {
    this._state.incrementTerm()
    this._state.transition('candidate')
  }
}

module.exports = Follower
