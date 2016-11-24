'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const memdown = require('memdown')
const async = require('async')

const Node = require('../')

describe('shared network', () => {
  let baseNode
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9990/p/1',
    '/ip4/127.0.0.1/tcp/9990/p/2',
    '/ip4/127.0.0.1/tcp/9990/p/3'
  ]

  const base = nodeAddresses[0]
  const nodes = []
  let network

  it('can create network', done => {
    network = Node.createNetwork({
      passive: {
        server: {
          host: '127.0.0.1',
          port: 9990
        }
      }
    })
    done()
  })

  it('can create base node', {timeout: 10000}, done => {
    baseNode = Node(
      nodeAddresses[0],
      {
        db: memdown,
        network,
        maxLogRetention: 2
      })
    nodes.push(baseNode)
    baseNode.start(err => {
      if (err) {
        return done(err)
      }
      baseNode.once('leader', done)
    })
  })

  it ('can make a few writes', done => {
    const db = baseNode.leveldown()
    async.eachSeries([1,2,3,4,5,6,7,8,9], (key, cb) => {
      db.put(key.toString(), key.toString(), cb)
    }, done)
  })

  it ('can rail in a second node', done => {
    const node = Node(
      nodeAddresses[1],
      {
        db: memdown,
        network,
        maxLogRetention: 2,
        peers: [nodeAddresses[0]]
      })
    nodes.push(node)
    node.start(err => {
      if (err) {
        return done(err)
      }
      baseNode.join(nodeAddresses[1], done)
    })
  })

  it ('can make a few more writes', done => {
    const db = nodes[1].leveldown()
    async.eachSeries([11,12,13,14,15,16,17,18,19], (key, cb) => {
      db.put(key.toString(), key.toString(), cb)
    }, done)
  })

  it ('can rail in a third node', {timeout: 10000}, done => {
    console.log('\n\n\nHERE\n\n\n')
    const node = Node(
      nodeAddresses[2],
      {
        db: memdown,
        network,
        maxLogRetention: 2,
        peers: [nodeAddresses[0], nodeAddresses[1]]
      })
    nodes.push(node)
    node.start(err => {
      if (err) {
        return done(err)
      }
      baseNode.join(nodeAddresses[2], done)
    })
  })

  it ('can make a few more writes', done => {
    const db = baseNode.leveldown()
    async.eachSeries([11,12,13,14,15,16,17,18,19], (key, cb) => {
      db.put(key.toString(), key.toString(), cb)
    }, done)
  })
})
