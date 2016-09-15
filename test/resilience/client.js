'use strict'

//const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z']
const keys = ['a']
const Multiaddr = require('multiaddr')
const wreck = require('wreck')
const timers = require('timers')
const once = require('once')

const reqOptions = {}

function Client (nodes, duration) {

  let timeout
  const started = Date.now()
  const stats = {
    writes: 0,
    reads: 0
  }
  const endpoints = nodes.map(multiAddrToUrl)

  const values = {}
  for (var i=0 ; i < keys.length; i++) {
    values[keys[i]] = 0
  }
  let leader = undefined

  return function client (_done) {
    const done = once(callback)
    timeout = timers.setTimeout(done, duration)
    work(done)

    function callback (err) {
      if (err) {
        console.log('stats: %j', stats)
        console.log('values: %j', values)
        _done(err)
      } else {
        _done(null, stats)
      }
    }
  }

  function work (done) {
    makeOneRequest (err => {
      if (err) {
        clearTimeout(timeout)
        done(err)
      } else {
        const elapsed = Date.now() - started
        if (elapsed < duration) {
          work(done)
        } else {
          clearTimeout(timeout)
          done()
        }
      }
    })
  }

  function makeOneRequest (done) {
    if (Math.random() > 0.8) {
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
      const options = Object.assign({}, reqOptions, {payload: value.toString()})
      wreck.put(`${endpoint}/${key}`, options, parsingWreckReply(201, tryPut, err => {
        if (err) {
          done(err)
        } else {
          stats.writes ++
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
      wreck.get(`${endpoint}/${key}`, reqOptions, parsingWreckReply(200, tryGet, (err, payload) => {
        if (err) {
          done(err)
        } else {
          stats.reads ++
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

  function parsingWreckReply (expectedCode, retry, done) {
    return function (err, res, payload) {
      if (err) {
        if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
          timers.setTimeout(retry, 1000)
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
          if (error && (error.code === 'ENOTLEADER' || error.code === 'ENOMAJORITY')) {
            if (error.leader) {
              leader = multiAddrToUrl(error.leader)
            } else {
              leader = undefined
            }
            timers.setTimeout(retry, 1000)
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
  const addr = Multiaddr(maddr)
  const url = `http://127.0.0.1:${Number(addr.nodeAddress().port) + 1}`
  return url
}

module.exports = Client
