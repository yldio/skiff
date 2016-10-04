'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const it = lab.it
const expect = require('code').expect

const net = require('net')
const Msgpack = require('msgpack5')
const async = require('async')

const Network = require('../lib/network/passive')

describe('passive network', () => {
  let network, clientOptions

  const to = '/ip4/127.0.0.1/tcp/9163'

  const clientAddresses = [
    '/ip4/127.0.0.1/tcp/8080/p/abc',
    '/ip4/127.0.0.1/tcp/8081/p/abc',
    '/ip4/127.0.0.1/tcp/8082/p/abc'
  ]

  const clients = clientAddresses.map(address => {
    const addr = address.split('/').slice(0, 5).join('/')
    return { address: addr }
  })

  it('can be created', done => {
    network = new Network()
    network.once('listening', (options) => {
      clientOptions = options
      done()
    })
  })

  it('accepts client connections', done => {
    async.map(clients, setupClient, done)
  })

  it('accepts a msgpack message from a client', done => {
    const expected = clients.reduce((messages, client) => {
      messages[client.address] = { from: client.address, to, what: 'hey' }
      return messages
    }, {})

    const node = network.node(to)

    node.on('data', (message) => {
      const from = message.from
      const expectedMessage = expected[from]
      expect(expectedMessage).to.equal({ from: from, to, what: 'hey' })
      delete expected[from]
      if (!Object.keys(expected).length) {
        node.removeAllListeners('data')
        done()
      }
    })

    clients.forEach(client => {
      client.encoder.write({ from: client.address, to, what: 'hey' })
    })
  })

  it('can send a message and reaches connected client', done => {
    async.each(clients, (client, cb) => {
      client.decoder.once('data', message => {
        expect(message).to.equal({to: client.address, beep: 'boop'})
        cb()
      })
      network.write({to: client.address, beep: 'boop'})
    }, done)
  })

  it('can try sending a message to an unconnected client', done => {
    network.write({to: 'does not exist', beep: 'nope'}, done)
  })

  it('can receive sending a message with no from', done => {
    clients[0].encoder.write({ something: 'is wrong' }, done)
  })

  it('can receive an invalid message', done => {
    network.once('warning', (warn) => {
      expect(warn.message).to.equal('not implemented yet')
      done()
    })
    clients[0].conn.write(new Buffer([0xc1]))
  })

  it('allows the peer to reconnect and send message', done => {
    const client = clients[0]
    const oldConn = client.conn
    setupClient(client, () => {
      oldConn.end()
      client.encoder.write({ from: client.address, to, the: 'new me' })
      client.encoder.write({ from: client.address, to, the: 'new me again' })

      const node = network.node(to)

      node.once('data', (message) => {
        expect(message).to.equal({ from: client.address, to, the: 'new me' })
        client.decoder.once('data', message => {
          expect(message).to.equal({ to: client.address, hope: 'this reaches you' })
          done()
        })
        node.write({ to: client.address, hope: 'this reaches you' })
      })
    })
  })

  it('can finish', done => {
    network.end()
    network.once('closed', done)
    clients.forEach(client => client.conn.end())
  })

  function setupClient (client, cb) {
    const conn = net.connect(clientOptions, cb)
    const msgpack = Msgpack()
    const decoder = msgpack.decoder()
    const encoder = msgpack.encoder()

    client.conn = conn
    client.decoder = decoder
    client.encoder = encoder

    conn.pipe(decoder)
    encoder.pipe(conn)
  }
})
