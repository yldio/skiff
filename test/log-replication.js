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

describe('log replication', () => {
  let follower, leader
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9190',
    '/ip4/127.0.0.1/tcp/9191',
    '/ip4/127.0.0.1/tcp/9192'
  ]

  const nodes = nodeAddresses.map(address => new Node(address))

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
    done()
  })

  it('follower does not accept command', done => {
    follower.command('SHOULD NOT GET IN', err => {
      expect(err).to.not.be.null()
      expect(err.message).to.equal('not the leader')
      expect(err.code).to.equal('ENOTLEADER')
      done()
    })
  })

  it('leader accepts command', done => {
    leader.command('COMMAND 1', err => {
      expect(err).to.be.null()
      done()
    })
  })

  it('waits a bit', done => setTimeout(done, A_BIT))
})
