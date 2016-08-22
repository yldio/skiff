'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')
const levelup = require('levelup')
const Memdown = require('memdown')

const Node = require('../')

const A_BIT = 1000

describe('log compaction', () => {
  let follower, leader, leveldown
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9490',
    '/ip4/127.0.0.1/tcp/9491',
    '/ip4/127.0.0.1/tcp/9492'
  ]

  const nodes = nodeAddresses.map((address, index) =>
    new Node(address, { db: Memdown, minLogRetention: 10 }))

  before(done => {
    nodes.forEach(node => node.on('warning', err => { throw err }))
    done()
  })

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  after(done => {
    async.each(nodes, (node, cb) => node.stop(cb), done)
  })

  before(done => {
    nodes.forEach((node, index) => {
      const selfAddress = nodeAddresses[index]
      const peers = nodeAddresses.filter(address => address !== selfAddress)
      peers.forEach(peer => node.join(peer))
    })
    done()
  })

  before(done => setTimeout(done, A_BIT))

  before(done => {
    leader = nodes.find(node => node.is('leader'))
    follower = nodes.find(node => node.is('follower'))
    expect(follower).to.not.be.undefined()
    expect(leader).to.not.be.undefined()
    expect(leader === follower).to.not.be.true()
    leveldown = leader.leveldown()
    done()
  })

  it ('can insert 50 items', done => {
    const items = []
    for(var i = 0 ; i < 50 ; i++) {
      items.push(i)
    }
    async.each(items, (item, cb) => {
      leveldown.put(item, item, cb)
    },
    done)
  })

  it ('log length was capped', done => {
    expect(leader._state._log._entries.length).to.equal(10)
    console.log(leader._state._log._entries)
    done()
  })
})
