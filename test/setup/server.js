'use strict'

const http = require('http')
const async = require('async')
const Memdown = require('memdown')
const Multiaddr = require('multiaddr')
const Node = require('../../')

const port = Number(process.argv[2])
const address = `/ip4/127.0.0.1/tcp/${port}`
const options = Object.assign({}, JSON.parse(process.argv[3]), {
  db: Memdown
})

const node = new Node(address, options)
const db = node.leveldown()
let isLeader = false

node.on('new state', state => {
  console.log('new state: %s', state)
  isLeader = (state === 'leader')
})
// node.on('connect', peer => {
//   if (isLeader) {
//     console.log('+ %j', peer)
//     console.log('connected to %j', node.connections())
//   }
// })
// node.on('disconnect', peer => {
//   if (isLeader) {
//     console.log('- %s', peer)
//     console.log('connected to %j', node.connections())
//   }
// })
// node.on('election timeout', () => console.log('election timeout'))

// setInterval(function() {
//   console.log('%d: stats: %j', Date.now(), node.stats())
// }, 1000)

const server = http.createServer(function(req, res) {
  console.log('request to node connected to %j', node.connections())
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