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

const A_BIT = 2000

describe('log replication catchup', () => {
  let follower, leader
  let newNode

  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9290',
    '/ip4/127.0.0.1/tcp/9291',
    '/ip4/127.0.0.1/tcp/9292'
  ]

  const nodes = nodeAddresses.map((address, index) =>
    new Node(address, {
      db: memdown,
      peers: nodeAddresses.filter(addr => addr !== address)
    }))

  const newAddress = '/ip4/127.0.0.1/tcp/9293'

  before(done => {
    nodes.forEach(node => node.on('warning', err => { throw err }))
    done()
  })

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  after(done => {
    async.each(nodes.concat(newNode), (node, cb) => node.stop(cb), done)
  })

  before({timeout: 3000}, done => setTimeout(done, A_BIT))

  before(done => {
    leader = nodes.find(node => node.is('leader'))
    follower = nodes.find(node => node.is('follower'))
    expect(follower).to.not.be.undefined()
    expect(leader).to.not.be.undefined()
    expect(leader === follower).to.not.be.true()
    done()
  })

  before(done => {
    done()
  })

  before(done => leader.command({type: 'put', key: 'a', value: '1'}, done))

  before(done => leader.command({type: 'put', key: 'b', value: '2'}, done))

  before(done => {
    done()
  })

  before({timeout: 3000}, done => setTimeout(done, A_BIT))

  before(done => {
    done()
  })

  before(done => {
    newNode = new Node(newAddress, {
      db: memdown,
      peers: nodeAddresses
    })
    newNode.on('warning', (err) => {
      throw err
    })
    newNode.start(done)
  })

  before(done => {
    done()
  })

  before(done => {
    leader.join(newAddress, done)
  })

  before(done => {
    done()
  })



  before({timeout: 3000}, done => setTimeout(done, A_BIT))

  it('new node gets updated', done => {
    const db = newNode._db.db
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
