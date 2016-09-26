'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')
const Memdown = require('memdown')

const Node = require('../')

const A_BIT = 4000

describe('levelup', () => {
  let nodes, follower, leader, levelup
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9390',
    '/ip4/127.0.0.1/tcp/9391',
    '/ip4/127.0.0.1/tcp/9392'
  ]

  before(done => {
    nodes = nodeAddresses.map((address, index) =>
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

  before({timeout: 5000}, done => setTimeout(done, A_BIT))

  before(done => {
    leader = nodes.find(node => node.is('leader'))
    follower = nodes.find(node => node.is('follower'))
    expect(follower).to.not.be.undefined()
    expect(leader).to.not.be.undefined()
    expect(leader === follower).to.not.be.true()
    done()
  })

  it ('can be created', done => {
    levelup = leader.levelup()
    done()
  })

  it ('can set bunch of keys', done => {
    async.each(
      ['a', 'b', 'c'],
      (key, cb) => {
        levelup.put(`key ${key}`, `value ${key}`, cb)
      },
      done)
  })

  it ('can get a key', done => {
    async.each(['a', 'b', 'c'], (key, cb) => {
      levelup.get(`key ${key}`, (err, values) => {
        expect(err).to.be.null()
        expect(values).to.equal(`value ${key}`)
        cb()
      })
    }, done)
  })

  it('key is there', done => {
    levelup.get('key c', done)
  })

  it('can del a key', done => {
    levelup.del('key c', done)
  })

  it('deleted key is no longer found', done => {
    levelup.get('key c', err => {
      expect(err.message).to.equal('Key not found in database [key c]')
      done()
    })
  })

  it('accepts batch commands', done => {
    const batch = [
      {type: 'put', key: 'key d', value: 'value d'},
      {type: 'put', key: 'key e', value: 'value e'},
      {type: 'del', key: 'key b'},
    ]
    levelup.batch(batch, done)
  })

  it('batch puts were effective', done => {
    async.map(['key d', 'key e'], levelup.get.bind(levelup),
      (err, results) => {
        expect(err).to.be.null()
        expect(results).to.equal(['value d', 'value e'])
        done()
      })
  })

  it('batch dels were effective', done => {
    levelup.get('key b', err => {
      expect(err.message).to.equal('Key not found in database [key b]')
      done()
    })
  })

  describe('read stream', () => {
    let rs

    it('can be created', done => {
      rs = levelup.createReadStream()
      done()
    })

    it('can iterate through all the keys', done => {
      let stopped = false
      const expecteds = [
        {key: 'key a', value: 'value a'},
        {key: 'key d', value: 'value d'},
        {key: 'key e', value: 'value e'}
      ]

      rs.on('data', (data) => {
        expect(data).to.equal(expecteds.shift())
        if (expecteds.length === 0) {
          done()
        }
      })
    })
  })
})
