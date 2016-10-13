'use strict'

const debug = require('debug')('skiff.network.active')
const Writable = require('stream').Writable

const Peer = require('./peer')
const NetworkNode = require('../network-node')

const defaultOptions = {
  objectMode: true,
  highWaterMark: 50
}

class Network extends Writable {

  constructor (_options) {
    const options = Object.assign({}, _options || {}, defaultOptions)
    debug('creating network with options %j', options)
    super(options)
    this._peers = {}
    this._nodes = {}
    this._options = options
    this._ended = false

    this.once('finish', () => {
      debug('network finished')
      debug('ending peers')
      Object.keys(this._peers).forEach((address) => this._peers[address].end())
    })
  }

  node (address) {
    let node = this._nodes[address]
    if (!node) {
      node = this._nodes[address] = new NetworkNode(address, this, this._options)
      node.once('finish', () => {
        node.removeAllListeners()
        this.removeListener('warning', onWarning)
        this.removeListener('connect', onConnect)
        this.removeListener('disconnect', onDisconnect)
        delete this._nodes[address]
      })
      this
        .on('warning', onWarning)
        .on('connect', onConnect)
        .on('disconnect', onDisconnect)
    }
    return node

    function onWarning (err, peer) {
      if (node.match(peer)) {
        node.emit('warning', err)
      }
    }

    function onConnect (peer) {
      node.emit('connect', peer)
    }

    function onDisconnect (peer) {
      node.emit('disconnect', peer)
    }
  }

  disconnect (address) {
    const peer = this._peers[address]
    if (peer) {
      peer.end()
      peer.removeAllListeners()
      delete this._peers[address]
    }
  }

  _write (message, _, callback) {
    debug('writing %j', message)
    if (!this._ended) {
      const peer = this._ensurePeer(message.to)
      peer.write(message, callback)
    }
  }

  end (buf) {
    this._ended = true
    return super.end(buf)
  }

  _ensurePeer (_address) {
    const address = _address.toString()
    debug('ensuring peer %s', address)
    let peer = this._peers[address]
    if (!peer) {
      peer = this._peers[address] = new Peer(address, this._options)
      peer
        .on('error', (err) => {
          this.emit('warning', err, address)
        })
        .once('finish', () => {
          debug('peer %s closed', address)
          delete this._peers[address]
        })
        .on('data', (message) => {
          debug('have message from peer: %j', message)
          this._deliver(message)
        })
        .on('connect', () => {
          this.emit('connect', address)
        })
        .on('disconnect', () => {
          this.emit('disconnect', address)
        })
        .on('innactivity timeout', () => {
          this.disconnect(address)
        })
    }

    return peer
  }

  _deliver (message) {
    if (message.to && (typeof message.to) !== 'string') {
      throw new Error(`message.to shouldnt be a ${typeof message.to}`)
    }
    if (message.from && (typeof message.from) !== 'string') {
      throw new Error(`message.from shouldnt be a ${typeof message.from}`)
    }
    Object.keys(this._nodes)
      .map(address => this._nodes[address])
      .filter(node => node.match(message.to))
      .forEach(node => node.push(message))
  }

  peerStats (address) {
    const peer = this._peers[address]
    if (peer) {
      return peer.stats()
    }
  }

}

module.exports = Network
