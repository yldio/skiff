'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const it = lab.it
const expect = require('code').expect

const Dispatcher = require('../lib/incoming-dispatcher')

describe('incoming dispatcher', () => {
  let dispatcher

  it('can be created', done => {
    dispatcher = new Dispatcher({ maxPending: 10 })
    done()
  })

  it('can ask for next', done => {
    expect(dispatcher.next()).to.be.undefined()
    done()
  })

  it('accepts new objects', done => {
    for (var i = 0; i < 10; i++) {
      dispatcher.write(i)
    }
    done()
  })

  it('should keep inserted objects', done => {
    let i
    let prev = -1

    while (i = dispatcher.next()) {
      expect(i).to.equal(prev + 1)
      prev = i
    }
    done()
  })

  it('should cap', done => {
    for (var i = 0; i < 20; i++) {
      dispatcher.write(i)
    }

    let prev = 9

    while (i = dispatcher.next()) {
      expect(i).to.equal(prev + 1)
      prev = i
    }

    done()
  })

  it('should emit when inserting', done => {
    dispatcher.once('readable', () => {
      expect(dispatcher.next()).to.equal('a')
      done()
    })
    dispatcher.write('a')
  })
})
