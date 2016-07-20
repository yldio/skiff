'use strict'

const debug = require('debug')('skiff.network')
const Duplex = require('stream').Duplex

const Peer = require('./peer')
const OK_ERRORS = require('./errors').OK_ERRORS

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
          if (OK_ERRORS.indexOf(err.code) === -1) {
            debug('caught peer error: %s', err.stack)
            this.emit('error', err)
          }
        })
        .once('close', () => {
          debug('peer %s closed', address)
          delete this.peers[address]
        })
    }

    peer.on('data', (message) => this.push(message))

    return peer
  }

}

module.exports = Network
