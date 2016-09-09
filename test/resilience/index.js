'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const Setup = require('./setup')

describe('resilience', () => {
  const setup = Setup()
  before(setup.before)
  after(setup.after)

  it ('works', done => {
    done()
  })
})
