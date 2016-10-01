'use strict'

const debug = require('debug')('skiff.client')

const timers = require('timers')

const NotLeaderError = require('./utils/not-leader-error')

class Client {

  constructor (node, options) {
    this._node = node
    this._options = options
  }

  command (command, options, done) {
    const self = this
    debug('command %j', command)
    const node = this._pickNode()
    if (!node) {
      done(new NotLeaderError(this._node.leader()))
    } else {
      if (!options.tries) {
        options.tries = 1
      }
      options.tries ++
      if (node === this._node.id) {
        // local call
        this._node.command(command, options, handleReply)
      } else {
        // remote call
        debug('rpcing command to %s, command: %j', node, command)
        const rpcOptions = Object.assign({}, options, { remote: true })
        this._node.rpc({
          from: this._node.id,
          to: node,
          action: 'Command',
          params: { command, options: rpcOptions }
        }, handlingRPCReply(handleReply))
      }
    }

    function handleReply (err, result) {
      debug('reply to command %j: err: %s, reply: %j', command, err && err.message, result)
      if (err) {
        if (err.message === 'not connected') {
          maybeRetry()
        } else if (err.code === 'ENOTLEADER' || err.code === 'ENOMAJORITY' || err.code === 'EOUTDATEDTERM') {
          if (err.leader) {
            maybeRetry(true) // immediate
          } else {
            maybeRetry()
          }
        } else {
          done(err)
        }
      } else {
        done(null, result)
      }
    }

    function maybeRetry (immediate) {
      if (options.tries < self._options.clientMaxRetries) {
        if (immediate) {
          timers.setImmediate(() => self._node.command(command, options, done))
        } else {
          timers.setTimeout(
            () => self._node.command(command, options, done),
            self._options.clientRetryRPCTimeout)
        }
      } else {
        done(new NotLeaderError(self._node.leader()))
      }
    }
  }

  _pickNode () {
    let node = this._node.leader()
    if (!node) {
      node = this._randomNode()
    }
    return node
  }

  _randomNode () {
    const peers = this._node.peers()
    return peers[Math.floor(Math.random() * peers.length)]
  }
}

function handlingRPCReply (callback) {
  return function (err, reply) {
    if (!err && reply.params && reply.params.error) {
      err = reply.params.error
      if (typeof err === 'object') {
        err = new Error(err.message)
        err.code = reply.params.error.code
        err.leader = reply.params.error.leader
      } else {
        err = new Error(err)
      }
    }
    callback(err, reply && reply.params && reply.params.result)
  }
}

module.exports = Client
