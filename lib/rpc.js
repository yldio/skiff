'use strict'

const debug = require('debug')('skiff.rpc')
const once = require('once')
const uuid = require('uuid').v4
const timers = require('timers')

module.exports = function createRPC (node, network, replies, emitter, defaults) {
  return function rpc (options, callback) {
    debug('%s: rpc to: %s, action: %s, params: %j', node.id, options.to, options.action, options.params)
    const term = node.term()
    const done = once(callback)
    const id = uuid()

    const timeoutMS = options.timeout || defaults.rpcTimeoutMS
    const timeout = timers.setTimeout(onTimeout, timeoutMS)
    const started = Date.now()

    network.write({
      from: node.id.toString(),
      id,
      type: 'request',
      to: options.to,
      action: options.action,
      params: options.params
    }, err => {
      if (err) {
        cancel()
        done(err)
      } else {
        emitter.emit('message sent')
        emitter.emit('rpc sent', options.action)
      }
    })
    replies.on('data', onReplyData)

    function onReplyData (message) {
      if (!message.fake) {
        timers.setImmediate(() => emitter.emit('rpc latency', Date.now() - started))
      }

      const accept = (
        message.type === 'reply' &&
        message.from === options.to &&
        message.id === id)

      if (node.term() > term) {
        onOutdatedTerm()
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
      done(Object.assign(new Error(`timeout RPC to ${options.to}, action = ${options.action}`), { code: 'ETIMEOUT' }))
    }

    function onOutdatedTerm () {
      debug('Outdated term')
      cancel()
      done(Object.assign(new Error('outdated term'), { code: 'EOUTDATEDTERM' }))
    }

    function cancel () {
      replies.removeListener('data', onReplyData)
      timers.clearTimeout(timeout)
    }
  }
}
