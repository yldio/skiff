'use strict'

const debug = require('debug')('skiff.network.passive')
const Duplex = require('stream').Duplex
const merge = require('deepmerge')

const Server = require('./server')

const defaultOptions = {
  objectMode: true,
  server: {
    port: 9163,
    host: '0.0.0.0',
    exclusive: true
  }
}

class Network extends Duplex {

  constructor (_options) {
    // TODO: merge options.server
    const options = merge(defaultOptions, _options || {})
    debug('creating network with options %j', options)
    super(options)
    this._options = options
    this.once('finish', this._finish.bind(this))
    this._listen()
  }

  _listen () {
    debug('network listen()')
    this._server = new Server(this._options.server)
    this._server
      .once('listening', (options) => this.emit('listening', options))
      .on('data', message => {
        debug('incoming message from server: %j', message)
        this.push(message)
      })
      .on('warning', warn => this.emit('warning', warn))
      .once('closed', () => {
        this.emit('closed')
      })
  }

  _read (size) {
    // do nothing
  }

  _write (message, _, callback) {
    debug('writing %j', message)
    this._server.write(message, callback)
  }

  _finish () {
    this._server.close()
  }

}

module.exports = Network
