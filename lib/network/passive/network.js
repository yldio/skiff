'use strict'

const debug = require('debug')('skiff.network.passive')
const Writable = require('stream').Writable
const merge = require('deepmerge')

const Server = require('./server')
const NetworkNode = require('../network-node')

const defaultOptions = {
  objectMode: true,
  server: {
    port: 9163,
    host: '0.0.0.0',
    exclusive: true
  }
}

class Network extends Writable {

  constructor (_options) {
    // TODO: merge options.server
    const options = merge(defaultOptions, _options || {})
    debug('creating network with options %j', options)
    super(options)
    this._nodes = {}
    this._options = options
    this._listening = false
    this.once('finish', this._finish.bind(this))
    this._listen()
  }

  node (address) {
    let node = this._nodes[address]
    if (!node) {
      node = this._nodes[address] = new NetworkNode(address, this, this._options)
      node.once('finish', () => delete this._nodes[address])
    }

    return node
  }

  _listen () {
    debug('network listen()')
    this._server = new Server(this._options.server)
    this._server
      .once('listening', (options) => {
        this._listening = true
        this.emit('listening', options)
      })
      .on('data', message => {
        debug('incoming message from server: %j', message)
        this._deliver(message)
      })
      .on('warning', warn => this.emit('warning', warn))
      .once('closed', () => {
        this.emit('closed')
      })
  }

  listening () {
    return this._listening
  }

  _deliver (message) {
    Object.keys(this._nodes)
      .map(address => this._nodes[address])
      .filter(node => node.match(message.to))
      .forEach(node => node.push(message))
  }

  _write (message, _, callback) {
    debug('writing %j', message)

    if (!message) {
      return callback()
    }

    if (message.to) {
      message.to = message.to.toString()
    }
    if (message.from) {
      message.from = message.from.toString()
    }
    this._server.write(message, callback)
  }

  _finish () {
    this._server.close()
  }

}

module.exports = Network
