'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const timers = require('timers')

const Setup = require('./setup')
const Client = require('./client')

describe('resilience', () => {
  const setup = Setup()
  before(setup.before)
  after(setup.after)

  it ('works', {timeout: 61000}, done => {
    const client = Client(setup.addresses, 60000)
    client(done)
  })
})
