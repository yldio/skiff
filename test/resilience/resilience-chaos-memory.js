'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const timers = require('timers')

const Setup = require('./setup')
const Client = require('./setup/client')

describe('resilience, chaos, in memory', () => {
  const setup = Setup()
  before({timeout: 30000}, setup.before)
  after({timeout: 30000}, setup.after)

  it ('works', {timeout: 121000}, done => {
    let timeout
    const client = Client(setup.addresses, {duration  : 120000})
    const emitter = client((err) => {
      timers.clearTimeout(timeout)
      console.log('stats: %j', emitter.stats)
      done(err)
    })
    resetOperationTimeout()
    emitter.on('operation', resetOperationTimeout)

    function onOperationTimeout () {
      done(new Error('no operation for more than 11 seconds'))
    }

    function resetOperationTimeout () {
      if (timeout) {
        timers.clearTimeout(timeout)
      }
      timeout = timers.setTimeout(onOperationTimeout, 11000)
    }
  })
})
