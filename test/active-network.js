'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const Multiaddr = require('multiaddr')
const net = require('net')
const timers = require('timers')
const Msgpack = require('msgpack5')

const Network = require('../src/network/active')

const serverAddresses = [
  '/ip4/127.0.0.1/tcp/8080',
  '/ip4/127.0.0.1/tcp/8081',
  '/ip4/127.0.0.1/tcp/8082',
  ]

const A_BIT = 500

describe('active network', () => {

  let network, servers
  const serverData = serverAddresses.map(() => [])
  const serverConns = serverAddresses.map(() => undefined)
  const serverHandlers = serverAddresses.map((server, index) => {
    return function(conn) {
      const msgpack = Msgpack()
      conn.pipe(msgpack.decoder()).on('data', onServerData)

      const reply = msgpack.encoder()
      reply.pipe(conn)

      function onServerData(data) {
        serverData[index].push(data)
        const message = Object.assign({}, data, { isReply: true})
        reply.write(message)
      }
    }

  })

  before(done => {
    let listening = 0

    servers = serverAddresses.map((addr, index) => {
      const maddr = Multiaddr(addr)
      const server = net.createServer(onServerConnection)
      const listenAddr = maddr.nodeAddress()
      server.listen({port: listenAddr.port, host: listenAddr.address}, onceListening)
      return server

      function onServerConnection(conn) {
        serverConns[index] = conn
        serverHandlers[index](conn)
        conn.once('finish', () => serverConns[index] = undefined)
      }
    })

    function onceListening() {
      if (++ listening === servers.length) {
        done()
      }
    }
  })

  it('can be created', done => {
    network = Network()
    done()
  })

  it('can be used to send a message to a peer', done => {
    network.once('data', message => {
      expect(message).to.equal({to: serverAddresses[0], what: 'hey', isReply: true})
      done()
    })
    network.write({to: serverAddresses[0], what: 'hey'})
  })

  it('peer gets the message', done => {
    expect(serverData[0].length).to.equal(1)
    expect(serverData[0].shift()).to.equal({to: serverAddresses[0], what: 'hey'})
    done();
  })

  it('allows message to unconnected peer', done => {
    network.write({to: '/ip4/127.0.0.1/tcp/8083', what: 'hey'}, done)
  })

  it('waits a bit', done => {
    timers.setTimeout(done, A_BIT)
  })

  it('allows peer to disconnect', done => {
    serverConns[0].destroy()
    done()
  })

  it('sending a message while trying to reconnect will fail silently', done => {
    network.write({to: serverAddresses[0], what: 'should not have reached you'}, done)
  })

  it('can still send data to another peer', done => {
    network.once('data', message => {
      expect(message).to.equal({to: serverAddresses[1], what: 'hey you', isReply: true})
      done()
    })
    network.write({to: serverAddresses[1], what: 'hey you'})
  })

  it('waits a bit', done => {
    timers.setTimeout(done, A_BIT)
  })

  it('can still send data to another peer 2', done => {
    network.once('data', message => {
      expect(message).to.equal({to: serverAddresses[2], what: 'hey you dude', isReply: true})
      done()
    })
    network.write({to: serverAddresses[2], what: 'hey you dude'})
  })

  it('peer gets the message', done => {
    expect(serverData[1]).to.equal([{to: serverAddresses[1], what: 'hey you'}])
    done();
  })

  it('can send data to reconnected peer', done => {
    network.once('data', message => {
      expect(message).to.equal({to: serverAddresses[0], what: 'hey you\'re back!', isReply: true})
      done()
    })
    network.write({to: serverAddresses[0], what: 'hey you\'re back!'})
  })

  it('reconnected peer gets the message', done => {
    expect(serverData[0].length).to.equal(1)
    expect(serverData[0].shift()).to.equal({to: serverAddresses[0], what: 'hey you\'re back!'})
    done();
  })

  it('can remove existing peer', done => {
    network.disconnect('/ip4/127.0.0.1/tcp/8083')
    done()
  })

  it('can remove non-existing peer', done => {
    network.disconnect('/ip4/127.0.0.1/tcp/8084')
    done()
  })

  it('waits a bit', done => {
    timers.setTimeout(done, A_BIT)
  })

  it('catches errors', done => {
    serverHandlers[2] = function(conn) {
      const msgpack = Msgpack()
      conn.pipe(msgpack.decoder()).on('data', onServerData)

      function onServerData(data) {
        expect(data).to.equal({to: serverAddresses[2], what: 'yo'})
        // reply garbage
        conn.end(new Buffer([0xc1]))
        done()
      }
    }

    // make it reconnect
    serverConns[2].destroy()

    setTimeout(() => network.write({to: serverAddresses[2], what: 'yo'}), A_BIT)
  })

  it('waits a bit', done => {
    timers.setTimeout(done, A_BIT)
  })

  it('can get closed', done => {
    let closed = 0
    servers.forEach(server => server.close(onceClosed))
    network.end()

    function onceClosed() {
      if (++ closed === servers.length) {
        done()
      }
    }
  })

})
