'use strict'

const merge = require('deepmerge')

const defaultOptions = {
  electionTimeoutMS: 200
}

class Base {

  constructor (node, options) {
    this._node = node
    this._options = merge(options, defaultOptions)
  }

  _handleMessage (message, done) {
    switch (message.action) {
      case 'RequestVote':
        this._requestVoteReceived(message)
        break
      default:
        if (this.__handleMessage) {
          this.__handleMessage(message, done)
        }
    }
  }

  _requestVoteReceived (message, done) {
    const term = this._node.state.term()
    const votedFor = this._node.state.getVotedFor()
    const voteGranted =
      (term >= message.term) &&
      (!votedFor || votedFor === message.from) &&
      (message.lastLogIndex >= this._node.state.lastLogIndex())

    if (voteGranted) {
      this._node.state.setVotedFor(message.from)
    }

    this._node.network.reply(
      {
        from: message.from,
        id: message.id,
        params: {
          term,
          voteGranted
        }
      },
      done)
  }

}

module.exports = Base
