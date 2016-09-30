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

      debug('rpcing command to %s, command: %j', node, command)
      this._node.rpc({
        from: this._node.id,
        to: node,
        action: 'Command',
        params: { command, options }
      }, handlingReply((err, reply) => {
        debug('reply to command %j: err: %s, reply: %j', command, err && err.message, reply)
        if (err) {
          if (err.message === 'not connected') {
            maybeRetry()
          } else if (err.code === 'ENOTLEADER' || err.code === 'ENOMAJORITY') {
            if (err.leader) {
              maybeRetry(true) // immediate
            } else {
              maybeRetry()
            }
          } else {
            done(err)
          }
        } else {
          done(null, reply.params.result)
        }
      }))

      function maybeRetry (immediate) {
        console.log('maybe retry', options.tries, self._options.clientMaxRetries)
        if (options.tries < self._options.clientMaxRetries) {
          console.log('ABOUT TO TRTRY')
          if (immediate) {
            console.log('IMMEDIATELY')
            timers.setImmediate(() => self.command(command, options, done))
          } else {
            timers.setTimeout(
              () => self.command(command, options, done),
              self._options.clientRetryRPCTimeout)
          }
        } else {
          done(NotLeaderError(self._node.leader()))
        }
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

function handlingReply(callback) {
  return function(err, reply) {
    if (!err && reply.params && reply.params.error) {
      err = reply.params.error
      if (typeof err === 'object') {
        err = new Error(err.message)
        err.code = reply.params.error.code
        err.leader = reply.params.error.leader
      } else {
        err = new Error(err)
      }
      console.log('ERROR:', err.code)
    }
    callback(err, reply)
  }
}

module.exports = Client
