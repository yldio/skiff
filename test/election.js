'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')

const Node = require('../')

const A_BIT = 1000

describe('election', () => {
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9090',
    '/ip4/127.0.0.1/tcp/9091',
    '/ip4/127.0.0.1/tcp/9092'
  ]

  const nodes = nodeAddresses.map(address => new Node(address))

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  after(done => {
    async.each(nodes, (node, cb) => node.stop(cb), done)
  })

  it('can join another node', done => {
    nodes.forEach((node, index) => {
      const selfAddress = nodeAddresses[index]
      const peers = nodeAddresses.filter(address => address !== selfAddress)
      peers.forEach(peer => node.join(peer))
    })
    done()
  })

  it('waits a bit', done => setTimeout(done, A_BIT))

  it('one of the nodes gets elected', done => {
    const leader = nodes.find(node => node.is('leader'))
    const follower = nodes.find(node => node.is('follower'))
    expect(follower).to.not.be.undefined()
    expect(leader).to.not.be.undefined()
    expect(leader === follower).to.not.be.true()
    done()
  })
})
