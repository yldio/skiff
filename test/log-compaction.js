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
const leftPad = require('left-pad')

const Node = require('../')

const A_BIT = 1900

describe('log compaction', () => {
  let follower, leader, leveldown
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9490',
    '/ip4/127.0.0.1/tcp/9491',
    '/ip4/127.0.0.1/tcp/9492'
  ]

  const nodes = nodeAddresses.map((address, index) =>
    new Node(address, {
      db: Memdown,
      minLogRetention: 10,
      peers: nodeAddresses.filter(addr => addr !== address)
    }))

  before(done => {
    nodes.forEach(node => node.on('warning', err => { throw err }))
    done()
  })

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
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

  it ('can insert 30 items', {timeout: 10000}, done => {
    const items = []
    for(var i = 0 ; i < 30 ; i++) {
      items.push(leftPad(i.toString(), 3, '0'))
    }
    async.each(items, (item, cb) => {
      leveldown.put(item, item, cb)
    },
    done)
  })

  it ('log length was capped', done => {
    expect(leader._state._log._entries.length).to.equal(10)
    done()
  })

  return;

  describe ('node that is late to the party', () => {
    const newNode = new Node('/ip4/127.0.0.1/tcp/9493', {
      db: Memdown,
      minLogRetention: 10,
      peers: nodeAddresses
    })

    before(done => newNode.start(done))

    after(done => {
      async.each(nodes, (node, cb) => node.stop(cb), done)
    })

    after(done => {
      newNode.stop(done)
    })

    before(done => setTimeout(done, A_BIT))

    it('waits a bit', done => setTimeout(done, A_BIT))

    it('catches up', done => {
      let nextEntry = 0
      newNode._db.state.createReadStream()
        .on('data', (entry) => {
          const expectedKey = leftPad(nextEntry, 3, '0')
          expect(entry.key).to.equal(expectedKey)
          nextEntry ++
        })
        .once('end', () => {
          expect(nextEntry).to.equal(30)
          done()
        })
    })
  })
})
