'use strict'

const debug = require('debug')('skiff.peer')
const Duplex = require('stream').Duplex
const Multiaddr = require('multiaddr')
const Msgpack = require('msgpack5')

const reconnect = require('./reconnect')
const OK_ERRORS = require('./errors').OK_ERRORS

const defaultOptions = {
  objectMode: true,
  highWaterMark: 50
}

const interestingEvents = [
  'connect',
  'reconnect',
  'disconnect',
  'error'
]

const reconnectOptions = {
  immediate: true,
  maxDelay: 5000
}

class Peer extends Duplex {

  constructor (address, options) {
    debug('constructing peer from address %j', address)
    super(Object.assign({}, options, defaultOptions))
    this._address = Multiaddr(address)

    this.once('finish', this._finish.bind(this))
    this._connect()
  }

  end (buf) {
    debug('peer end() called for peer %s', this._address)
    super.end(buf)
  }

  _connect () {
    debug('connecting to %s', this._address)

    const peer = this
    this._reconnect = reconnect(reconnectOptions, (peerRawConn) => {
      debug('connected to peer %s', this._address)
      const msgpack = Msgpack()

      // to peer
      this._out = msgpack.encoder()
      this._out.pipe(peerRawConn)

      // from peer
      const fromPeer = msgpack.decoder()
      peerRawConn.pipe(fromPeer)

      fromPeer.on('data', (data) => {
        debug('some data from peer: %j', data)
        peer.push(data)
      })

      peerRawConn.on('error', handlePeerError)
      fromPeer.on('error', handlePeerError)

      this.emit('connect')
    })
    .on('error', handlePeerError)
    .on('disconnect', () => {
      debug('disconnected from %s', this._address)
      this._out = undefined
      this.emit('disconnect')
    })

    interestingEvents.forEach((event) => {
      this._reconnect.on(event, (payload) => {
        this.emit(event, payload)
      })
    })

    this._reconnect.connect(this._address)

    function handlePeerError (err) {
      if (OK_ERRORS.indexOf(err.code) === -1) {
        debug('relaying error:\n%s', err.stack)
        peer.emit('error', err)
      }
    }
  }

  _read (size) {
    // do nothing, we'll emit data when the peer emits data
  }

  _write (message, encoding, callback) {
    debug('writing %j to %s', message, this._address)
    if (this._out) {
      this._out.write(message, callback)
    } else {
      debug('not connected yet to peer %s', this._address)
      // if we're not connected we discard the message
      callback()
    }
  }

  _finish () {
    debug('finishing connection to peer %s', this._address)
    this._reconnect.disconnect()
  }

}

module.exports = Peer
