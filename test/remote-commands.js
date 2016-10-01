'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')
const memdown = require('memdown')
const leftpad = require('left-pad')

const Node = require('../')

const A_BIT = 4000

describe('log replication', () => {
  let nodes, followers, leader
  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/9700',
    '/ip4/127.0.0.1/tcp/9701',
    '/ip4/127.0.0.1/tcp/9702'
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
    followers = nodes.filter(node => !node.is('leader'))
    expect(followers.length).to.equal(2)
    expect(leader).to.not.be.undefined()
    done()
  })

  it('follower accepts command', done => {
    const commands = []
    for(var i=0; i < 20; i++) {
      commands.push({type: 'put', key: leftpad(i.toString(), 3, '0'), value: i})
    }
    async.eachSeries(commands, (command, cb) => {
      const index = command.value % followers.length
      const follower = followers[index]
      follower.command(command, cb)
    }, done)
  })

  it('can query from followers', done => {
    const db = followers[0].levelup()
    let next = 0
    db.createReadStream()
      .on('data', entry => {
        expect(entry.key).to.equal(leftpad(next.toString(), 3, '0'))
        expect(entry.value).to.equal(next)
        next ++
      })
      .once('end', () => {
        expect(next).to.equal(20)
        done()
      })
  })

  it('can query one value from follower', done => {
    const db = followers[0].levelup()
    db.get('019', (err, value) => {
      expect(err).to.be.null()
      expect(value).to.equal(19)
      done()
    })
  })

  it('can query from leader', done => {
    expect(leader.is('leader')).to.equal(true)
    const db = leader.levelup()
    let next = 0
    db.createReadStream()
      .on('data', entry => {
        expect(entry.key).to.equal(leftpad(next.toString(), 3, '0'))
        expect(entry.value).to.equal(next)
        next ++
      })
      .once('end', () => {
        expect(next).to.equal(20)
        done()
      })
  })

})
