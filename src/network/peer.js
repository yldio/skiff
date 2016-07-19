'use strict'

const debug = require('debug')('skiff.peer')
const Duplex = require('stream').Duplex
const Multiaddr = require('multiaddr')
const Msgpack = require('msgpack5')

const reconnect = require('./reconnect')

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
  immediate: true
}

const OK_ERRORS = [
  'ECONNREFUSED'
]

class Peer extends Duplex {

  constructor (address, options) {
    debug('constructing peer from address %j', address)
    super(Object.assign({}, options || {}, defaultOptions))
    this._address = Multiaddr(address)

    this.once('finish', this._finish.bind(this))
    this._connect()
  }

  _connect () {
    debug('connecting to %s', this._address)

    this._reconnect = reconnect(reconnectOptions, (peer) => {
      debug('got stream to peer %s', this._address)
      const msgpack = Msgpack()

      const toPeer = msgpack.encoder()
      toPeer.pipe(peer)

      const fromPeer = this._out = msgpack.decoder()
      fromPeer.pipe(this, { end: false })
      fromPeer.on('data', (data) => this.push(data))

      peer.on('error', (err) => {
        if (OK_ERRORS.indexOf(err.code) === -1) {
          this.emit('error', err)
        }
      })
    })
    .connect(this._address)

    interestingEvents.forEach((event) => {
      this._reconnect.on(event, (payload) => {
        this.emit(event, payload)
      })
    })

    this._reconnect
      .on('connect', (con) => {
        debug('connected to %s', this._address)
        con.on('error', (err) => {
          debug('error from peer:\n%s', err.stack)
          this.emit('warning', err)
        })
      })
      .on('disconnect', () => {
        debug('disconnected from %s', this._address)
        this._out = undefined
      })
  }

  _read (size) {
    // do nothing, we'll emit data when the peer emits data
  }

  _write (message, encoding, callback) {
    debug('writing %j to %s', message, this._address)
    if (this._out) {
      return this._out.write(message, callback)
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
