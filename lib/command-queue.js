'use strict'

const debug = require('debug')('skiff.command-queue')
const Writable = require('stream').Writable
const merge = require('deepmerge')

const defaultOptions = {
  objectMode: true
}

class CommandQueue extends Writable {

  constructor (_options) {
    const options = merge(defaultOptions, _options || {})
    super(options)
    this._options = options
    this._pending = []
  }

  next (message) {
    return this._pending.shift()
  }

  _write (message, _, callback) {
    debug('_write %j', message)
    this._pending.push(message)
    callback()
    this.emit('readable')
  }
}

module.exports = CommandQueue
