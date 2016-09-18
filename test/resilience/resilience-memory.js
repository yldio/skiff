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

describe('resilience', () => {
  const setup = Setup()
  before(setup.before)
  after(setup.after)

  it ('works', {timeout: 121000}, done => {
    let timeout
    const client = Client(setup.addresses, {duration  : 120000})
    const emitter = client(done)
    resetOperationTimeout()
    // emitter.on('operation started', () => console.log('operation started'))
    emitter.on('operation', resetOperationTimeout)

    function onOperationTimeout () {
      console.log('stats: %j', emitter.stats)
      done(new Error('no operation for more than 9 seconds'))
    }

    function resetOperationTimeout () {
      if (timeout) {
        timers.clearTimeout(timeout)
      }
      timeout = timers.setTimeout(onOperationTimeout, 9000)
    }
  })
})
