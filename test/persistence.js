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

describe('persistence', () => {

  let nodes, leader, leveldown, term, items
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9490',
    '/ip4/127.0.0.1/tcp/9491',
    '/ip4/127.0.0.1/tcp/9492'
  ]

  before(done => {
    nodes = nodeAddresses.map((address) =>
      Node(address, {
        db: Memdown,
        peers: nodeAddresses.filter(addr => addr !== address)
      }))
    done()
  })

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  before({timeout: 5000}, done => setTimeout(done, A_BIT))

  before(done => {
    leader = nodes.find(node => node.is('leader'))
    expect(leader).to.not.be.undefined()
    leveldown = leader.leveldown()
    term = leader.term()
    done()
  })

  before({timeout: 10000}, done => {
    items = []
    for(var i = 0 ; i < 30 ; i++) {
      items.push(leftPad(i.toString(), 3, '0'))
    }
    async.each(items, (item, cb) => {
      leveldown.put(item, item, cb)
    },
    done)
  })

  before({timeout: 5000}, done => setTimeout(done, A_BIT))

  before({timeout: 4000}, done => async.each(nodes, (node, cb) => node.stop(cb), done))

  before(done => {
    // restart nodes
    nodes = nodeAddresses.map((address) =>
      Node(address, {
        db: Memdown,
        peers: nodeAddresses.filter(addr => addr !== address)
      }))
    done()
  })

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  after(done => {
    async.each(nodes, (node, cb) => node.stop(cb), done)
  })

  it('retains logs and other metadata', done => {
    const expected = items.map((item, index) => {
      return {
        t: term,
        i: index + 1,
        c: {
          type: 'put',
          key: item,
          value: item
        }}
    })

    const snapshot = leader._node._getPersistableState()
    expect(typeof snapshot.currentTerm).to.equal('number')
    expect(snapshot.currentTerm >= 1).to.be.true()
    expect(snapshot.votedFor).to.equal(leader.id.toString())

    nodes.forEach(node => {
      const entries = node.logEntries().map(entry => {
        return {i: entry.i, t: entry.t, c: {
          type: entry.c.type,
          key: entry.c.key,
          value: entry.c.value
        }}
      })
      expect(entries).to.equal(expected)

      const nodeSnapshot = node._node._getPersistableState()
      expect(nodeSnapshot.currentTerm).to.equal(snapshot.currentTerm)
      expect(typeof nodeSnapshot.votedFor).to.equal('string')
    })
    done()
  })
})
