'use strict'

const debug = require('debug')('skiff.network.node')
const Duplex = require('stream').Duplex

class NetworkNode extends Duplex {

  constructor (address, out, options) {
    super(options)
    this._matchAddress = address.toString().split('/')
    this._out = out
    this._ended = false
    this._out.once('finish', () => {
      debug('out channel finished')
      this._ended = true
    })
  }

  match (_address) {
    const address = _address && _address.toString()
    const parts = address && address.split('/')
    const matches = parts && this._matchAddress.every((part, index) => parts[index] === part)
    debug('match %j to own %j. matches: %j', parts, this._matchAddress, matches)
    return matches
  }

  _read () {
    // do nothing
  }

  _write (message, _, callback) {
    if (!this._ended) {
      try {
        this._out.write(message, () => {
          callback()
          // ignore the errors, keep stream alive
        })
      } catch (err) {
        this.emit('warning', err)
        // fixme: catch write after end errors
      }
    }
  }
}

module.exports = NetworkNode
