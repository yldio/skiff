'use strict'

const debug = require('debug')('skiff.node')
const extend = require('deep-extend')
const EventEmitter = require('events')
const async = require('async')
const Levelup = require('levelup')

const Address = require('./lib/address')
const Network = require('./lib/network')
const IncomingDispatcher = require('./lib/incoming-dispatcher')
const Node = require('./lib/node')
const CommandQueue = require('./lib/command-queue')
const Commands = require('./lib/commands')
const DB = require('./lib/db')
const Leveldown = require('./lib/leveldown')
const Iterator = require('./lib/iterator')
const defaultOptions = require('./lib/default-options')

const importantStateEvents = [
  'warning',
  'new state',
  'election timeout',
  'leader',
  'follower',
  'candidate',
  'weakened',
  'rpc latency',
  'joined',
  'left'
]

class Shell extends EventEmitter {

  constructor (id, _options) {
    super()
    this.id = Address(id)

    let savedOptions

    if (_options) {
      // saved complex uncloneable options
      savedOptions = {}
      if (_options.db) {
        savedOptions.db = _options.db
        delete _options.db
      }
      if (_options.network) {
        savedOptions.network = _options.network
        delete _options.network
      }
      if (_options.peers) {
        savedOptions.peers = _options.peers
        delete _options.peers
      }
    }

    this._options = extend({}, defaultOptions, _options || {})
    if (savedOptions) {
      Object.assign(this._options, savedOptions)
    }

    // validade if the passive network is compatible with assigned id
    if (this._options.network && this._options.network.passive) {
      const serverAddress = this._options.network.passive.address().nodeAddress()
      const addr = this.id.nodeAddress()
      if (serverAddress.address !== '0.0.0.0' && addr.address !== serverAddress.address || addr.port !== serverAddress.port) {
        throw new Error(
          `invalid address: ${id.toString()}. it's not compatible with network server address ${JSON.stringify(serverAddress)}`)
      }
    }

    debug('creating node %s with peers %j', id, this._options.peers)
    this._ownsNetwork = false

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

    this._node = new Node(
      this.id,
      connections,
      this._dispatcher,
      this._db,
      this.peers.bind(this),
      this._options)

    // propagate important events
    importantStateEvents.forEach(event => this._node.on(event, this.emit.bind(this, event)))

    this._commandQueue = new CommandQueue()
    this._commands = new Commands(this.id, this._commandQueue, this._node)

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
    this._node.on('message received', () => {
      this._stats.messagesReceived ++
    })
    this._node.on('message sent', () => {
      this._stats.messagesSent ++
    })
    this._node.on('rpc sent', (type) => {
      this._stats.rpcSent ++
      this._stats.rpcSentByType[type] ++
    })
    this._node.on('rpc received', (type) => {
      this._stats.rpcReceived ++
      this._stats.rpcReceivedByType[type] ++
    })
  }

  // ------ Start and stop

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
          this._node._transition('follower')
          cb(err)
        })
    } else if (this._startState === 'started') {
      process.nextTick(cb)
    } else if (this._startState === 'starting') {
      this.once('started', cb)
    }
  }

  _startNetwork (cb) {
    const network = this._getNetworkConstructors()

    this._network = {
      passive: network.passive.node(this.id),
      active: network.active.node(this.id)
    }

    this._network.passive.pipe(this._dispatcher, { end: false })
    this._network.active.pipe(this._dispatcher, { end: false })

    this._node.passive.pipe(this._network.passive, { end: false })
    this._node.active.pipe(this._network.active, { end: false })

    this._network.active.on('connect', peer => {
      this.emit('connect', peer)
    })
    this._network.active.on('disconnect', peer => {
      this.emit('disconnect', peer)
    })

    if (cb) {
      if (network.passive.listening()) {
        process.nextTick(cb)
      } else {
        network.passive.once('listening', () => {
          cb() // do not carry event args into callback
        })
      }
    }
  }

  _getNetworkConstructors () {
    const address = this.id.nodeAddress()
    let constructors = this._options.network
    if (!constructors) {
      this._ownsNetwork = constructors = Network(
        {
          passive: {
            server: extend(
              {
                port: address.port,
                host: address.address
              },
              this._options.server
            )
          }
        }
      )
    }

    return constructors
  }

  _loadPersistedState (cb) {
    this._db.load((err, results) => {
      if (err) {
        cb(err)
      } else {
        this._node._log.setEntries(results.log)
        if (results.meta.currentTerm) {
          this._node._setTerm(results.meta.currentTerm)
        }
        if (results.meta.votedFor) {
          this._node._setVotedFor(results.meta.votedFor)
        }
        if (results.meta.peers) {
          this._node._peers = results.meta.peers
        }
        cb()
      }
    })
  }

  stop (cb) {
    if (this._network) {
      if (cb) {
        if (this._ownsNetwork) {
          this._ownsNetwork.passive.once('closed', cb)
        } else {
          process.nextTick(cb)
        }
      }
      if (this._ownsNetwork) {
        this._ownsNetwork.passive.end()
        this._ownsNetwork.active.end()
        this._ownsNetwork = undefined
      }
      this._network = undefined
    } else if (cb) {
      process.nextTick(cb)
    }

    this._node.stop()
  }

  // ------ Topology

  join (address, done) {
    debug('%s: joining %s', this.id, address)
    this.start(err => {
      if (err) {
        done(err)
      } else {
        this._node.join(address, done)
      }
    })
  }

  leave (address, done) {
    debug('%s: leaving %s', this.id, address)
    this.start(err => {
      if (err) {
        done(err)
      } else {
        this._node.leave(address, done)
      }
    })
  }

  // ------ Commands

  command (command, options, callback) {
    if (typeof options === 'function') {
      callback = options
      options = {}
    }
    if (this.is('leader')) {
      this._commandQueue.write({command, options, callback})
    } else {
      // bypass the queue if we're not the leader
      this._node.command(command, options, callback)
    }
  }

  readConsensus (callback) {
    this._node.readConsensus(callback)
  }

  // ------- State

  is (state) {
    return this._node.is(state)
  }

  weaken (duration) {
    this._node.weaken(duration)
  }

  // -------- Level*

  leveldown () {
    return new Leveldown(this)
  }

  levelup (options) {
    return Levelup(this.id, Object.assign({}, {
      db: this.leveldown.bind(this),
      valueEncoding: 'json'
    }, options))
  }

  iterator (options) {
    return new Iterator(this, this._db.state, options)
  }

  // -------- Stats

  stats () {
    return this._stats
  }

  connections () {
    return this._connections
  }

  peers (done) {
    this._node.peers(this._network, done)
  }

  term () {
    return this._node._getTerm()
  }

  logEntries () {
    return this._node.getLogEntries()
  }
}

createNodeShell.createNetwork = function createNetwork (options) {
  return Network(options)
}

module.exports = createNodeShell

function createNodeShell (id, options) {
  return new Shell(id, options)
}
