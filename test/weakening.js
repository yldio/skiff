'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')
const memdown = require('memdown')

const Node = require('../')

const A_BIT = 4000

describe('log replication', () => {
  let nodes, followers, leader, preferred, weakened
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9710',
    '/ip4/127.0.0.1/tcp/9711',
    '/ip4/127.0.0.1/tcp/9712'
  ]

  before(done => {
    nodes = nodeAddresses.map((address, index) =>
      Node(address, {
        db: memdown,
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

  before({timeout: 5000}, done => setTimeout(done, A_BIT))

  before(done => {
    leader = nodes.find(node => node.is('leader'))
    followers = nodes.filter(node => node.is('follower'))
    expect(followers.length).to.equal(2)
    expect(leader).to.not.be.undefined()
    done()
  })

  it('can weaken all the nodes except the preferred', done => {
    preferred = followers[0]
    weakened = followers.filter(f => f !== preferred).concat(leader)
    weakened.forEach(w => w.weaken(1100))
    done()
  })

  it('waits a bit', {timeout: 5000}, done => setTimeout(done, A_BIT))

  it('resulted in ellecting the preferred', done => {
    expect(preferred.is('leader')).to.be.true()
    expect(weakened.every(w => w.is('follower'))).to.be.true()
    done()
  })

})
