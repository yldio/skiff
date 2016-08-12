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
const Sublevel = require('level-sublevel')

const Node = require('../')

const A_BIT = 1000

describe('log replication catchup', () => {
  let follower, leader
  let newNode, newDB

  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9290',
    '/ip4/127.0.0.1/tcp/9291',
    '/ip4/127.0.0.1/tcp/9292'
  ]
  const databases = nodeAddresses.map(node => {
    return levelup(node, { db: memdown })
  })

  const nodes = nodeAddresses.map((address, index) =>
    new Node(address, { db: databases[index] }))

  const newAddress = '/ip4/127.0.0.1/tcp/9293'

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

  after(done => {
    newNode.stop(done)
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

  before(done => leader.command({type: 'put', key: 'a', value: '1'}, done))

  before(done => leader.command({type: 'put', key: 'b', value: '2'}, done))

  before(done => setTimeout(done, A_BIT))

  before(done => {
    newDB = levelup(newAddress, { db: memdown })
    newNode = new Node(newAddress, { db: newDB })
    newNode.start(done)
  })

  before(done => {
    nodes.forEach(node => {
      newNode.join(node.id)
      node.join(newAddress)
    })
    done()
  })

  before(done => setTimeout(done, A_BIT))

  it('new node gets updated', done => {
    const db = Sublevel(newDB)
    db.sublevel('state').get('a', (err, value) => {
      expect(err).to.be.null()
      expect(value).to.equal('1')

      db.sublevel('state').get('b', (err, value) => {
        expect(err).to.be.null()
        expect(value).to.equal('2')
        done()
      })
    })
  })
})
