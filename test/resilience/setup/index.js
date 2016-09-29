'use strict'

const async = require('async')
const timers = require('timers')
const fork = require('child_process').fork
const path = require('path')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')

const Node = require('./node')

const defaultOptions = {
  persist: false,
  chaos: true,
  nodeCount: 3,
  killerIntervalMS: 10000
}

function Setup(_options) {
  let killer, liveNodes
  const deadNodes = []
  const allAddresses = []
  const options = Object.assign({}, defaultOptions, _options)
  const maxDeadNodes = Math.ceil(options.nodeCount / 2) - 1
  const dataPath = path.join(__dirname, '..', 'resilience', 'data')

  let killing = true

  return { before, after, addresses: allAddresses}

  function before (done) {
    async.series([setupDirs, createNodes, startNodes, startKiller], done)
  }

  function after (done) {
    async.series([stopKiller, stopNodes], done)
  }

  function setupDirs (done) {
    rimraf.sync(dataPath)
    mkdirp.sync(dataPath)
    done()
  }

  function createNodes (done) {
    const ports = []
    for (var i=0; i < options.nodeCount ; i++) {
      ports.push(5300 + i*2)
    }

    ports.map(portToAddress).forEach(address => allAddresses.push(address))

    liveNodes = ports.map(port => new Node(port, {
      peers: ports.filter(p => p !== port).map(portToAddress),
      persist: options.persist
    }))

    done()
  }

  function startNodes (done) {
    async.each(liveNodes, (node, cb) => node.start(cb), done)
  }

  function startKiller (done) {
    if (options.chaos) {
      killer = timers.setTimeout(() => {
        killAndRevive(err => {
          if (err) {
            throw err
          } else {
            startKiller()
          }
        })
      }, options.killerIntervalMS)
    }

    if (done) {
      done()
    }
  }

  function killAndRevive (cb) {
    if (deadNodes.length >= maxDeadNodes) {
      killing = false
    } else if (!deadNodes.length) {
      killing = true
    }
    if (killing) {
      killOne(cb)
    } else {
      reviveOne(cb)
    }
  }

  function killOne (cb) {
    const node = popRandomLiveNode()
    console.log('killing %s...', node._address)
    deadNodes.push(node._address)
    node.stop(cb)
  }

  function reviveOne (cb) {
    const address = randomDeadNode()
    console.log('reviving %s...', address)
    const node = new Node(address, {
      peers: allAddresses.filter(addr => addr !== address)
    })
    liveNodes.push(node)
    node.start(cb)
  }

  function popRandomLiveNode () {
    const index = Math.floor(Math.random() * liveNodes.length)
    const node = liveNodes[index]
    liveNodes.splice(index, 1)
    return node
  }

  function randomDeadNode () {
    const index = Math.floor(Math.random() * deadNodes.length)
    const node = deadNodes[index]
    deadNodes.splice(index, 1)
    return node
  }

  function stopKiller (done) {
    timers.clearInterval(killer)
    done()
  }

  function stopNodes (done) {
    async.each(liveNodes, (node, cb) => node.stop(cb), done)
  }
}

function portToAddress (port) {
  return `/ip4/127.0.0.1/tcp/${port}`
}

module.exports = Setup
