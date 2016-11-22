'use strict'

const debug = require('debug')('skiff.network.peer')
const Duplex = require('stream').Duplex
const timers = require('timers')
const Encoder = require('../encoder')
const Decoder = require('../decoder')

const schema = require('../schema')
const Address = require('../../address')
const reconnect = require('./reconnect')
const OK_ERRORS = require('./errors').OK_ERRORS

const defaultOptions = {
  objectMode: true,
  highWaterMark: 50,
  innactivityTimeout: 5000
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

  constructor (myAddress, remoteAddress, _options) {
    debug('%s: constructing peer from address %j', myAddress, remoteAddress)
    const options = Object.assign({}, defaultOptions, _options)
    super(options)
    this._options = options
    this._myAddress = myAddress
    this._remoteAddress = Address(remoteAddress)
    this._ended = false

    this._stats = {
      receivedMessageCount: 0,
      sentMessageCount: 0,
      lastReceived: 0,
      lastSent: 0
    }

    this.once('finish', this._finish.bind(this))

    this._pinger = timers.setInterval(this._ping.bind(this), options.pingIntervalMS)

    this._connect()
  }

  end (buf) {
    debug('%s: peer end() called for peer %s', this._myAddress, this._remoteAddress)
    this._ended = true
    timers.clearInterval(this._pinger)
    super.end(buf)
  }

  _connect () {
    debug('%s: connecting to %s', this._myAddress, this._remoteAddress)
    const peer = this
    this._reconnect = reconnect(reconnectOptions, (peerRawConn) => {
      debug('%s: connected to peer %s', this._myAddress, this._remoteAddress)
      let innactivityTimeout
      resetInnactivityTimeout()

      // to peer
      this._out = new Encoder(schema)

      this._out.pipe(peerRawConn)

      // from peer
      const fromPeer = new Decoder(schema)
      peerRawConn.pipe(fromPeer)

      fromPeer.on('data', (data) => {
        this._stats.lastReceived = Date.now()
        this._stats.receivedMessageCount ++
        resetInnactivityTimeout()
        debug('some data from peer: %j', data)
        peer.push(data)
      })

      peerRawConn.on('error', handlePeerError)
      fromPeer.on('error', handlePeerError)

      peerRawConn.on('close', () => {
        debug('%s: connection to peer %s closed', this._myAddress, this._remoteAddress)
        this._out = undefined
        timers.clearTimeout(innactivityTimeout)
      })

      process.nextTick(() => peer.emit('connect'))

      function resetInnactivityTimeout () {
        if (innactivityTimeout) {
          timers.clearTimeout(innactivityTimeout)
        }
        innactivityTimeout = timers.setTimeout(
          onInnactivityTimeout, peer._options.innactivityTimeout)
      }

      function onInnactivityTimeout () {
        peer.emit('innactivity timeout')
      }
    })
    .on('error', handlePeerError)
    .on('disconnect', () => {
      debug('%s: disconnected from %s', this._myAddress, this._remoteAddress)
      this._out = undefined
      this.emit('disconnect')
    })

    interestingEvents.forEach((event) => {
      this._reconnect.on(event, (payload) => {
        this.emit(event, payload)
      })
    })

    this._reconnect.connect(this._remoteAddress)

    function handlePeerError (err) {
      if (OK_ERRORS.indexOf(err.code) === -1) {
        debug('%s: relaying error:\n%s', this._myAddress, err.stack)
        peer.emit('error', err)
      }
    }
  }

  _read (size) {
    // do nothing, we'll emit data when the peer emits data
  }

  _write (message, encoding, callback) {
    debug('%s: writing %j to %s', this._myAddress, message, this._remoteAddress)

    if (!message) {
      return
    }
    if (message.to) {
      message.to = message.to.toString()
    }
    if (message.from) {
      message.from = message.from.toString()
    }

    if (this._out) {
      try {
        this._out.write(message, (err) => {
          if (err) {
            this.emit('warning', err)
          }
          // keep the juice flowing
          callback()
        })
        this._stats.lastSent = Date.now()
        this._stats.sentMessageCount ++
      } catch (err) {
        this.emit('warning', err, this._remoteAddress.toString())
      }
    } else {
      debug('%s: have message, but not connected to peer %s', this._myAddress, this._remoteAddress)
      // if we're not connected we discard the message
      // and reply with error
      timers.setImmediate(() => {
        this.push({
          type: 'reply',
          from: message.to,
          id: message.id,
          error: 'not connected',
          fake: true,
          params: {
            success: false,
            reason: 'not connected'
          }
        })
      })
      callback()
    }
  }

  _finish () {
    debug('%s: finishing connection to peer %s', this._myAddress, this._remoteAddress)
    timers.clearInterval(this._pinger)
    this._reconnect.disconnect()
  }

  _ping () {
    debug('%s: sending ping to %s', this._myAddress, this._remoteAddress)
    if (this._out) {
      this._out.write({
        from: this._myAddress,
        to: this._remoteAddress.toString(),
        type: 'broadcast',
        action: 'Ping'
      })
    }
  }

  stats () {
    return this._stats
  }

}

module.exports = Peer
