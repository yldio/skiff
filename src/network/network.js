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

    this.once('finish', () => {
      debug('network finished')
      debug('ending peers')
      Object.keys(this._peers).forEach((address) => this._peers[address].end())
    })
  }

  disconnect (address) {
    const peer = this._peers[address]
    if (peer) {
      peer.end()
    }
  }

  _read (size) {
    // do nothing
  }

  _write (message, _, callback) {
    debug('writing %j', message)
    const peer = this._ensurePeer(message.to)
    peer.write(message, callback)
  }

  _ensurePeer (address) {
    debug('ensuring peer %s', address)
    let peer = this._peers[address]
    if (!peer) {
      peer = this._peers[address] = new Peer(address, this._options)
      peer
        .on('error', (err) => {
          this.emit('warning', err)
        })
        .once('finish', () => {
          debug('peer %s closed', address)
          delete this._peers[address]
        })
        .on('data', (message) => this.push(message))
    }

    return peer
  }

}

module.exports = Network
