'use strict'

const debug = require('debug')('skiff.network')
const Duplex = require('stream').Duplex
const Peer = require('./peer')

const defaultOptions = {
  objectMode: true,
  highWaterMark: 50
}

class Network extends Duplex {

  constructor (_options) {
    const options = Object.assign({}, _options || {}, defaultOptions)
    debug('creating network with options %j', options)
    super(options)
    this._peers = {}
    this._options = options

    this.once('finish', this._finish.bind(this))
  }

  _read (size) {
    // do nothing
  }

  _write (message, encoding, callback) {
    const peer = this._ensurePeer(message.to)
    peer.write(message, callback)
  }

  _ensurePeer (address) {
    debug('ensuring peer %s', address)
    let peer = this._peers[address]
    if (!peer) {
      peer = this._peers[address] = new Peer(address, this._options)
      peer.on('error', (err) => this.emit('error', err))
    }

    peer.pipe(this, { end: false }).pipe(peer, { end: false })
    return peer
  }

  _finish () {
    debug('finishing')
    Object.keys(this._peers).forEach((addr) => this._peers[addr].end())
    this._peers = {}
  }

}

module.exports = Network
