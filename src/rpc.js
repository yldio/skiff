'use strict'

const debug = require('debug')('skiff.rpc')
const once = require('once')
const uuid = require('uuid').v4
const timers = require('timers')

module.exports = function createRPC (node, network, replies, emitter, defaults) {
  return function rpc (options, callback) {
    debug('%s: rpc to: %s, action: %s, params: %j', this.id, options.to, options.action, options.params)
    if (typeof options.to !== 'string') {
      throw new Error('need options.to to be a string')
    }
    const term = node.term()
    const done = once(callback)
    const id = uuid()

    const timeout = timers.setTimeout(onTimeout, options.timeout || defaults.rpcTimeoutMS)
    network.write({
      from: this.id,
      id,
      type: 'request',
      to: options.to,
      action: options.action,
      params: options.params
    }, err => {
      if (err) {
        callback(err)
      } else {
        emitter.emit('message sent')
        emitter.emit('rpc sent', options.action)
        replies.on('data', onReplyData)
      }
    })

    return cancel

    function onReplyData (message) {
      debug('%s: reply data: %j', node.id, message)
      const accept = (
        message.type === 'reply' &&
        message.from === options.to &&
        message.id === id)

      if (node.term() > term) {
        onTimeout()
      } else if (accept) {
        debug('%s: this is a reply I was expecting: %j', node.id, message)
        cancel()
        const error = message.error
        done(error, !error && message)
      }
    }

    function onTimeout () {
      debug('RPC timeout')
      cancel()
      const err = new Error('timeout RPC to ' + options.to)
      err.code = 'ETIMEOUT'
      done(err)
    }

    function cancel () {
      replies.removeListener('data', onReplyData)
      timers.clearTimeout(timeout)
    }
  }
}
