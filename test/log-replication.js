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
  let nodes, follower, leader
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9190',
    '/ip4/127.0.0.1/tcp/9191',
    '/ip4/127.0.0.1/tcp/9192'
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
    follower = nodes.find(node => node.is('follower'))
    expect(follower).to.not.be.undefined()
    expect(leader).to.not.be.undefined()
    expect(leader === follower).to.not.be.true()
    done()
  })

  it('leader accepts command', done => {
    leader.command({type: 'put', key: 'a', value: '1'}, err => {
      expect(err).to.be.undefined()
      done()
    })
  })

  it('leader accepts query command', done => {
    leader.command({type: 'get', key: 'a'}, (err, result) => {
      expect(err).to.be.null()
      expect(result).to.equal('1')
      done()
    })
  })

  before({timeout: 5000}, done => setTimeout(done, A_BIT))
})
