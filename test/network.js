'use strict'

const Lab = require('lab')
const lab = exports.lab = Lab.script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const Code = require('code')
const expect = Code.expect

const Multiaddr = require('multiaddr')
const net = require('net')
const timers = require('timers')
const Msgpack = require('msgpack5')

const Network = require('../src/network')

const serverAddresses = [
  '/ip4/127.0.0.1/tcp/8080',
  '/ip4/127.0.0.1/tcp/8081',
  '/ip4/127.0.0.1/tcp/8082',
  ]

describe('network', () => {

  let network, servers
  let serverData = serverAddresses.map(() => [])

  before(done => {
    let listening = 0

    servers = serverAddresses.map((addr, index) => {
      const maddr = Multiaddr(addr)
      const server = net.createServer(onServerConnection)
      const listenAddr = maddr.nodeAddress()
      server.listen({port: listenAddr.port, host: listenAddr.address}, onceListening)
      return server

      function onServerConnection(conn) {
        const msgpack = Msgpack()
        conn.pipe(msgpack.decoder()).on('data', onServerData)
      }

      function onServerData(data) {
        console.log('got server data: %j', data)
        serverData[index].push(data)
      }
    })


    function onceListening() {
      if (++ listening === servers.length) {
        done()
      }
    }
  })

  after(done => {
    let closed = 0
    servers.forEach(server => server.close(onceClosed))
    network.end()

    function onceClosed() {
      if (++ closed === servers.length) {
        done()
      }
    }
  })

  it('can be created', done => {
    network = Network()
    done()
  })

  it('can be used to send a message to a peer', done => {
    network.write({to: serverAddresses[0], what: 'hey'}, done)
  })

  it('peer gets the message', done => {
    expect(serverData[0]).to.equal([{to: serverAddresses[0], what: 'hey'}])
    done();
  })

  it('allows message to unconnected peer', done => {
    network.write({to: '/ip4/127.0.0.1/tcp/8083', what: 'hey'}, done)
  })

  it('waits a bit', done => {
    timers.setTimeout(done, 1000)
  })

  // it('allows peer to disconnect', done => {

  // })

  // it('allows peer to reconnect', done => {

  // })

})
