'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')
const Memdown = require('memdown')
const leftPad = require('left-pad')

const Node = require('../')

const A_BIT = 4000

describe('log compaction', () => {
  let nodes, follower, leader, leveldown
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9490',
    '/ip4/127.0.0.1/tcp/9491',
    '/ip4/127.0.0.1/tcp/9492'
  ]
  const newNodeAddress = '/ip4/127.0.0.1/tcp/9493'

  before(done => {
    nodes = nodeAddresses.map((address, index) =>
      Node(address, {
        db: Memdown,
        minLogRetention: 10,
        peers: nodeAddresses.filter(addr => addr !== address).concat(newNodeAddress)
      }))
    done()
  })

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  before({timeout: 5000}, done => setTimeout(done, A_BIT))

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
    expect(leader.logEntries().length).to.equal(10)
    done()
  })

  it('waits a bit', {timeout: 5000}, done => setTimeout(done, A_BIT))

  describe ('node that is late to the party', () => {
    let newNode

    before(done => {
      newNode = Node(newNodeAddress, {
        db: Memdown,
        minLogRetention: 10,
        peers: nodeAddresses
      })
      newNode.start(done)
    })

    after(done => {
      async.each(nodes.concat(newNode), (node, cb) => node.stop(cb), done)
    })

    before({timeout: 5000}, done => setTimeout(done, A_BIT))

    it('waits a bit', {timeout: 5000}, done => setTimeout(done, A_BIT))

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

    it('accepts more entries', {timeout: 10000}, done => {
      leader = nodes.concat(newNode).find(node => node.is('leader'))
      leveldown = leader.leveldown()

      const items = []
      for(var i = 30 ; i < 60 ; i++) {
        items.push(leftPad(i.toString(), 3, '0'))
      }
      async.each(items, (item, cb) => {
        leveldown.put(item, item, cb)
      },
      done)
    })

    it('waits a bit', {timeout: 5000}, done => setTimeout(done, A_BIT))

    it('new node catches up', done => {
      let nextEntry = 0
      newNode._db.state.createReadStream()
        .on('data', (entry) => {
          const expectedKey = leftPad(nextEntry, 3, '0')
          expect(entry.key).to.equal(expectedKey)
          nextEntry ++
        })
        .once('end', () => {
          expect(nextEntry).to.equal(60)
          done()
        })
    })
  })
})
