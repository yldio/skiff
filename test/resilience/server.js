'use strict'

const http = require('http')
const async = require('async')
const Memdown = require('memdown')
const Node = require('../../')

const port = Number(process.argv[2])
const address = `/ip4/127.0.0.1/tcp/${port}`
const options = Object.assign({}, JSON.parse(process.argv[3]), {
  db: Memdown
})

const node = new Node(address, options)
const db = node.leveldown()

const server = http.createServer(function(req, res) {
  if (req.method === 'POST') {
    console.log(req.path)
    req.setEncoding('utf8')
    req
      .on('data', d => body += d)
      .once('end', () => {
        handleWriteRequest(req.path, Number(body), res)
      })
  } else if (method === 'GET') {
    handleReadRequest(req.path, res)
  }
})

function handleWriteRequest(key, value, res) {
  db.put(key, value, err => {
    if (err) {
      res.end(JSON.stringify({error: err}))
    } else {
      res.end(JSON.stringify({ok: true}))
    }
  })
}

function handleReadRequest (key, res) {
  db.get(key, (err, value) => {
    if (err) {
      res.end(JSON.stringify({error: err}))
    } else {
      res.end(JSON.stringify({ok: true, value}))
    }
  })
}

async.parallel([server.listen.bind(server, port + 1), node.start.bind(node)], err => {
  if (err) {
    throw err
  } else {
    console.log(`server ${address} started`)
  }
})
