'use strict'

const debug = require('debug')('skiff.node')
const merge = require('deepmerge')
const Multiaddr = require('multiaddr')
const EventEmitter = require('events')
const async = require('async')
const join = require('path').join

const PassiveNetwork = require('./network/passive')
const ActiveNetwork = require('./network/active')
const IncomingDispatcher = require('./incoming-dispatcher')
const State = require('./state')
const CommandQueue = require('./command-queue')
const Commands = require('./commands')
const DB = require('./db')
const Leveldown = require('./leveldown')
const Iterator = require('./iterator')

const defaultOptions = {
  server: {},
  rpcTimeoutMS: 2000,
  peers: [],
  levelup: {},
  location: join(__dirname, '..', 'data')
}

const importantStateEvents = [
  'warning',
  'new state',
  'election timeout',
  'leader',
  'rpc latency'
]

class Node extends EventEmitter {

  constructor (id, _options) {
    debug('creating node %s with options %j', id, _options)
    super()
    this.id = id
    this._options = merge(defaultOptions, _options || {})

    this._db = new DB(this._options.location, this.id, this._options.db, this._options.levelup)

    this._dispatcher = new IncomingDispatcher({id})

    const connections = {
      isConnectedTo: (addr) => this._connections.indexOf(addr) >= 0
    }
    // connections
    this._connections = this._options.peers.filter(addr => addr !== id)

    this.on('connect', peer => {
      if (this._connections.indexOf(peer) < 0) {
        this._connections.push(peer)
      }
    })

    this.on('disconnect', peer => {
      this._connections = this._connections.filter(c => c !== peer)
    })

    this._state = new State(this.id, connections, this._dispatcher, this._db, this._options)

    // propagate important events
    importantStateEvents.forEach(event => {
      this._state.on(event, arg => this.emit(event, arg))
    })

    this._commandQueue = new CommandQueue()
    this._commands = new Commands(this.id, this._commandQueue, this._state)

    this._startState = 'stopped'

    // stats
    this._stats = {
      messagesReceived: 0,
      messagesSent: 0,
      rpcSent: 0,
      rpcReceived: 0,
      rpcReceivedByType: {
        'AppendEntries': 0,
        'RequestVote': 0,
        'InstallSnapshot': 0
      },
      rpcSentByType: {
        'AppendEntries': 0,
        'RequestVote': 0,
        'InstallSnapshot': 0
      }
    }
    this._state.on('message received', () => {
      this._stats.messagesReceived ++
    })
    this._state.on('message sent', () => {
      this._stats.messagesSent ++
    })
    this._state.on('rpc sent', (type) => {
      this._stats.rpcSent ++
      this._stats.rpcSentByType[type] ++
    })
    this._state.on('rpc received', (type) => {
      this._stats.rpcReceived ++
      this._stats.rpcReceivedByType[type] ++
    })
  }

  start (cb) {
    debug('%s: start state is %s', this.id, this._startState)
    if (this._startState === 'stopped') {
      this._startState = 'starting'
      debug('starting node %s', this.id)
      async.parallel(
        [
          this._startNetwork.bind(this),
          this._loadPersistedState.bind(this)
        ],
        err => {
          debug('%s: done starting', this.id)
          if (err) {
            this._startState = 'stopped'
          } else {
            this._startState = 'started'
            this.emit('started')
          }
          this._state._transition('follower')
          cb(err)
        })
    } else if (this._startState === 'started') {
      process.nextTick(cb)
    } else if (this._startState === 'starting') {
      this.once('started', cb)
    }
  }

  _startNetwork (cb) {
    const address = Multiaddr(this.id).nodeAddress()
    const passiveNetworkOptions = {
      server: merge(
        {
          port: address.port,
          host: address.address
        },
        this._options.server)
    }
    debug('about to configure passive network for %s with options %j', this.id, passiveNetworkOptions)
    const passiveNetwork = new PassiveNetwork(passiveNetworkOptions)

    if (cb) {
      passiveNetwork.once('listening', () => {
        cb()
      }) // do not carry event args into callback
    }

    this._network = {
      passive: passiveNetwork,
      active: new ActiveNetwork()
    }

    this._network.passive.pipe(this._dispatcher, { end: false })
    this._network.active.pipe(this._dispatcher, { end: false })

    this._state.passive.pipe(this._network.passive, { end: false })
    this._state.active.pipe(this._network.active, { end: false })

    this._network.active.on('connect', peer => {
      this.emit('connect', peer)
    })
    this._network.active.on('disconnect', peer => {
      this.emit('disconnect', peer)
    })
  }

  _loadPersistedState (cb) {
    this._db.load((err, results) => {
      if (err) {
        cb(err)
      } else {
        this._state._log.setEntries(results.log)
        if (results.meta.currentTerm) {
          this._state._setTerm(results.meta.currentTerm)
        }
        if (results.meta.votedFor) {
          this._state._setVotedFor(results.meta.votedFor)
        }
        if (results.meta.peers) {
          this._state._peers = results.meta.peers
        }
        cb()
      }
    })
  }

  stop (cb) {
    if (this._network) {
      if (cb) {
        this._network.passive.once('closed', cb)
      }
      this._network.passive.end()
      this._network.active.end()
    } else if (cb) {
      process.nextTick(cb)
    }

    this._state.stop()

    delete this._network
  }

  join (address, done) {
    debug('%s: joining %s', this.id, address)
    this.start(err => {
      if (err) {
        done(err)
      } else {
        this._state.join(address, done)
      }
    })
  }

  leave (address, done) {
    debug('%s: leaving %s', this.id, address)
    this.start(err => {
      if (err) {
        done(err)
      } else {
        this._state.leave(address, done)
      }
    })
  }

  command (command, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }
    this._commandQueue.write({command, options, callback})
  }

  is (state) {
    const currentState = this._state._stateName
    debug('%s: current state is %s', this.id, currentState)
    return this._state._stateName === state
  }

  leveldown () {
    return new Leveldown(this)
  }

  iterator (options) {
    return new Iterator(this._db.state, options)
  }

  stats () {
    return this._stats
  }

  connections () {
    return this._connections
  }

  peers () {
    const peers = this._state.peers()
    if (peers && this._network && this._network.active) {
      peers.forEach(peer => {
        peer.stats = this._network.active.peerStats(peer.address)
        if (peer.stats) {
          peer.stats.lastReceivedAgo = Date.now() - peer.stats.lastReceived
          peer.stats.lastSentAgo = Date.now() - peer.stats.lastSent
          delete peer.stats.lastReceived
          delete peer.stats.lastSent
        }
        peer.connected = this._connections.indexOf(peer.address) >= 0
      })
    }
    return peers
  }

  term () {
    return this._state._getTerm()
  }
}

module.exports = createNode

function createNode(id, options) {
  return new Node(id, options)
}
