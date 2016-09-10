'use strict'

const keys = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'x', 'y', 'z']
const Multiaddr = require('multiaddr')
const wreck = require('wreck')
const timers = require('timers')

const reqOptions = {
  // redirects: 1
}

function Client (nodes) {

  const endpoints = nodes.map(multiAddrToUrl)

  const values = {}
  for (var i=0 ; i < keys.length; i++) {
    values[keys[i]] = 0
  }
  let leader = undefined

  return function client (done) {
    work(done)
  }

  function work (done) {
    makeOneRequest (err => {
      if (err) {
        done(err)
      } else {
        work(done)
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
      wreck.put(`${endpoint}/${key}`, options, parsingWreckReply(201, tryPut, done))
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
          const value = Number(payload) || 0
          if (value !== expectedValue) {
            done(new Error(`GET request returned unexpected value for key ${key}. Expected ${expectedValue} and returned ${value}`))
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
        done(err)
      } else {
        if (res.statusCode !== expectedCode) {
          let error
          try {
            error = JSON.parse(payload).error
          } catch (er) {
            error = {}
          }
          if (error && error.code === 'ENOTLEADER') {
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
