'use strict'

const http = require('http')
const timers = require('timers')
const async = require('async')
const Memdown = require('memdown')
const Leveldown = require('leveldown')
const Multiaddr = require('multiaddr')
const join = require('path').join
const Node = require('../../../')

const port = Number(process.argv[2])
const address = `/ip4/127.0.0.1/tcp/${port}`
const options = Object.assign({}, JSON.parse(process.argv[3]), {
  location: join(__dirname, '..', 'resilience', 'data')
})

if (!options.persist) {
  options.db = Memdown
}

const node = new Node(address, options)
node.on('warning', err => { throw err })
const db = node.leveldown()

const server = http.createServer(function(req, res) {
  const key = req.url.substring(1)
  if (req.method === 'PUT') {
    let body = ''
    req.setEncoding('utf8')
    req
      .on('data', d => body += d)
      .once('end', () => {
        handleWriteRequest(key, Number(body), res)
      })
  } else if (req.method === 'GET') {
    handleReadRequest(key, res)
  } else {
    res.statusCode = 404
    res.end(encodeError(new Error('Not found')))
  }
})

function handleWriteRequest(key, value, res) {
  db.put(key, value, handlingError(key, res, 201))
}

function handleReadRequest (key, res) {
  db.get(key, handlingError(key, res))
}

async.parallel([server.listen.bind(server, port + 1), node.start.bind(node)], err => {
  if (err) {
    throw err
  } else {
    console.log(`server ${address} started`)
    node.on('new state', state => console.log('new state: %j', state))
  }
})

function encodeError (err) {
  return JSON.stringify({ error: { message: err.message, code: err.code, leader: err.leader }})
}
function handlingError (key, res, code) {
  return function (err, value) {
    if (err) {
      if (err.message.match(/not found/)) {
        res.statusCode = code || 200
        res.end(JSON.stringify({ok: true}))
      } else {
        res.statusCode = 500
        res.end(encodeError(err))
      }
    } else {
      res.statusCode = code || 200
      if (value) {
        res.end(value.toString())
      } else {
        res.end(JSON.stringify({ok: true}))
      }
    }
  }
}