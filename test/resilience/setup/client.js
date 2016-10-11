'use strict'

// const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z']
const keys = ['a']
const Multiaddr = require('multiaddr')
const Wreck = require('wreck')
const timers = require('timers')
const once = require('once')
const EventEmitter = require('events')

const defaultOptions = {
  duration: 60000,
  retryTimeout: 500
}

const wreck = Wreck.defaults({
  timeout: 8000
})

function Client (nodes, _options) {

  const emitter = new EventEmitter()
  emitter.stats = {
    operationsStarted: 0,
    operationsCompleted: 0
  }

  const options = Object.assign({}, defaultOptions, _options)

  let timeout
  const started = Date.now()
  const endpoints = nodes.map(multiAddrToUrl)

  const values = {}
  for (var i=0 ; i < keys.length; i++) {
    values[keys[i]] = 0
  }
  let leader = undefined

  return function client (_done) {
    const done = once(callback)
    timeout = timers.setTimeout(done, options.duration)
    work(done)
    return emitter

    function callback (err) {
      if (err) {
        _done(err)
      } else {
        _done(null)
      }
    }
  }

  function work (done) {
    emitter.stats.operationsStarted ++
    makeOneRequest (err => {
      emitter.stats.operationsCompleted ++
      if (err) {
        clearTimeout(timeout)
        done(err)
      } else {
        emitter.emit('operation')
        const elapsed = Date.now() - started
        if (elapsed < options.duration) {
          work(done)
        } else {
          clearTimeout(timeout)
          done()
        }
      }
    })
    emitter.emit('operation started')
  }

  function makeOneRequest (done) {
    if (Math.random() > 0.5) {
      makeOnePutRequest(done)
    } else {
      makeOneGetRequest(done)
    }
  }

  function makeOnePutRequest (done) {
    const key = randomKey()
    let value = values[key]
    value ++
    values[key] = value

    tryPut()

    function tryPut () {
      const endpoint = pickEndpoint()
      const options = { payload: value.toString() }
      wreck.put(`${endpoint}/${key}`, options, parsingWreckReply(endpoint, 201, tryPut, err => {
        if (err) {
          done(err)
        } else {
          done()
        }
      }))
    }
  }

  function makeOneGetRequest (done) {
    const key = randomKey()
    const expectedValue = values[key]

    tryGet()

    function tryGet () {
      const endpoint = pickEndpoint()
      wreck.get(`${endpoint}/${key}`, parsingWreckReply(endpoint, 200, tryGet, (err, payload) => {
        if (err) {
          done(err)
        } else {
          const value = Number(payload) || 0
          if (value !== expectedValue) {
            done(new Error(`GET request to ${endpoint} returned unexpected value for key ${key}. Expected ${expectedValue} and returned ${value}`))
          } else {
            done()
          }
        }
      }))
    }
  }

  function pickEndpoint () {
    let endpoint = leader
    if (!endpoint) {
      endpoint = randomEndpoint()
    }
    return endpoint
  }

  function randomEndpoint () {
    return endpoints[Math.floor(Math.random() * endpoints.length)]
  }

  function randomKey () {
    return keys[Math.floor(Math.random() * keys.length)]
  }

  function parsingWreckReply (address, expectedCode, retry, done) {
    return function (err, res, payload) {
      if (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET' || err.code === 'ETIMEOUT') {
          leader = null
          timers.setTimeout(retry, 100)
        } else {
          done(err)
        }
      } else {
        if (res.statusCode !== expectedCode) {
          let error
          try {
            error = JSON.parse(payload).error
          } catch (er) {
            error = {}
          }
          if (error && (error.code === 'ENOTLEADER' || error.code === 'ENOMAJORITY' || error.code === 'EOUTDATEDTERM')) {
            if (error.leader) {
              leader = multiAddrToUrl(error.leader)
            } else {
              leader = undefined
            }
            timers.setImmediate(retry)
          } else if (error.code === 'ETIMEOUT') {
            timers.setImmediate(retry)
          } else {
            done (new Error(`response status code was ${res.statusCode}, response: ${payload}`))
          }
        } else {
          done(null, payload)
        }
      }
    }
  }
}

function multiAddrToUrl (maddr) {
  const addr = Multiaddr(maddr.toString())
  const url = `http://127.0.0.1:${Number(addr.nodeAddress().port) + 1}`
  return url
}

module.exports = Client
