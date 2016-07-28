'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const async = require('async')

const Node = require('../')

describe('election', () => {

  const nodeAddresses = [
    '/ip4/127.0.0.1/tcp/8080',
    '/ip4/127.0.0.1/tcp/8081',
  ]

  const nodes = nodeAddresses.map(address => new Node(address))

  before(done => {
    async.each(nodes, (node, cb) => node.start(cb), done)
  })

  after(done => {
    async.each(nodes, (node, cb) => node.stop(cb), done)
  })

  it('works!', done => {
    done()
  })

})