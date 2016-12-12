'use strict'

const debug = require('debug')('skiff.network.passive.server')
const net = require('net')
const Duplex = require('stream').Duplex
const extend = require('deep-extend')

const Encoder = require('../encoder')
const Decoder = require('../decoder')
const schema = require('../schema')

const defaultOptions = {
  objectMode: true
}

class Server extends Duplex {

  constructor (_options) {
    const options = extend({}, _options, defaultOptions)
    debug('building server with options %j', options)
    super(options)
    this._options = options
    this._server = net.createServer(this._onConnection.bind(this))
    this._server.once('close', () => {
      this.emit('closed')
    })
    this._peers = {}
    this._listen()
  }

  close () {
    this._server.close()
  }

  _listen () {
    this._server.listen(this._options, () => {
      debug('server listening with options %j', this._options)
      this.emit('listening', this._options)
    })
  }

  _read () {
    // do nothing
  }

  _write (message, _, callback) {
    debug('server trying to write %j', message)
    const peer = this._peers[message.to]
    if (peer) {
      debug('I have peer for message to %s', message.to)
      try {
        peer.write(message, (err) => {
          if (err) {
            debug(err.stack)
            this.emit('warning', err)
          }
        })
      } catch (err) {
        debug(err.stack)
        this.emit('warning', err)
      }
    } else {
      debug('I have no peer to send to')
    }
    callback()
  }

  _onConnection (conn) {
    debug('new server connection')
    const server = this
    conn.once('finish', () => {
      debug('connection ended')
    })

    const fromPeer = new Decoder(schema)
    conn
      .pipe(fromPeer)
      .on('error', onPeerError)

    const toPeer = new Encoder(schema)
    toPeer
      .pipe(conn)
      .on('error', onPeerError)

    toPeer.on('error', onPeerError)

    fromPeer.on('data', this._onMessage.bind(this, conn, toPeer))

    function onPeerError (err) {
      debug('peer error: %s', err.stack)
      server.emit('warning', err)
      fromPeer.end()
      toPeer.end()
      conn.end()
    }
  }

  _onMessage (conn, toPeer, message) {
    debug('incoming message: %j', message)
    const from = message.from
    if (from) {
      if (message.action === 'AppendEntries') {
        console.log('SERVER got AppendEntries')
      }
      const peer = this._peers[from]
      if (!peer || peer !== toPeer) {
        debug('setting up peer %s', from)
        this._peers[from] = toPeer
        conn.once('finish', () => delete this._peers[from])
      } else {
        debug('no need to setup new peer')
      }
      debug('pushing out message from %s', from)
      this.push(message)
    } else {
      debug('no .from in message')
    }
  }

}

module.exports = Server
