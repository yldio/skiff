'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')
const levelup = require('levelup')
const memdown = require('memdown')

const Node = require('../')

const A_BIT = 1000

describe('log replication', () => {
  let follower, leader, leveldown
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9190',
    '/ip4/127.0.0.1/tcp/9191',
    '/ip4/127.0.0.1/tcp/9192'
  ]

  const nodes = nodeAddresses.map((address, index) =>
    new Node(address, { db: memdown }))

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

  it ('can create a leveldown instance', done => {
    leveldown = leader.leveldown()
    done()
  })

  it ('can use it to set bunch of keys', done => {
    async.each(
      ['a', 'b', 'c'],
      (key, cb) => {
        leveldown.put(`key ${key}`, `value ${key}`, cb)
      },
      done)
  })

  it ('can use it to get a key', done => {
    async.each(['a', 'b', 'c'], (key, cb) => {
      leveldown.get(`key ${key}`, (err, values) => {
        expect(err).to.be.null()
        expect(values).to.equal(`value ${key}`)
        cb()
      })
    }, done)
  })
})