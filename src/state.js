'use strict'

const Through = require('through2')
const uuid = require('uuid').v4
const timers = require('timers')
const once = require('once')
const EventEmitter = require('events')

const States = require('./states')

class State extends EventEmitter {

  constructor (id, dispatcher, options) {
    super()
    this.id = id
    this._dispatcher = dispatcher
    this.passive = this._outStream()
    this.active = this._outStream()
    this._peers = []

    // state
    this._term = 0
    this._lastLogIndex = 0
    this._lastLogTerm = 0
    this._votedFor = null

    this._stateServices = {
      id: id,
      term: this._getTerm.bind(this),
      lastLogIndex: this._getLastLogIndex.bind(this),
      lastLogTerm: this._getLastLogTerm.bind(this),
      setState: this._setState.bind(this),
      incrementTerm: this._incrementTerm.bind(this),
      getVotedFor: this._getVotedFor.bind(this)
    }

    this._networkingServices = {
      rpc: this._rpc.bind(this),
      reply: this._reply.bind(this),
      peers: this._peers
    }

    this._setState('follower')

    this._dispatch()
  }

  _setState (state) {
    const oldState = this._state
    if (oldState) {
      oldState.stop()
    }

    const State = States(state)
    this._state = new State({
      state: this._stateServices,
      network: this._networkingServices
    })
    this._state.start()

    this.emit('new state', state)
    this.emit(state)
  }

  _incrementTerm () {
    this._votedFor = null
    return ++this._term
  }

  _getTerm () {
    return this._term
  }

  _getLastLogIndex () {
    return this._lastLogIndex
  }

  _getLastLogTerm () {
    return this._lastLogTerm
  }

  _getVotedFor () {
    return this._getVotedFor
  }

  _rpc (to, action, params, callback) {
    const done = once(callback)
    const id = uuid()
    const timeout = timers.setTimeout(onTimeout, this._options.rpcTimeoutMS)
    this.active.on('data', onNetworkData)
    this.active.write({
      from: this._node.state.id,
      id,
      type: 'request',
      to,
      action,
      params
    })

    function onNetworkData (message) {
      if (message.type === 'reply' && message.from === to && message.id === id) {
        this.active.removeListener('data', onNetworkData)
        timers.clearTimeout(timeout)
        done(null, message)
      }
    }

    function onTimeout () {
      this.active.removeListener('data', onNetworkData)
      const err = new Error('timeout RPC to ' + to)
      err.code = 'ETIMEOUT'
      done(err)
    }
  }

  _reply (to, messageId, params, callback) {
    this.passive.write({
      type: 'reply',
      from: this._node.state.id,
      id: messageId,
      params
    }, callback)
  }

  _dispatch () {
    const message = this._dispatcher.next()
    if (!message) {
      this._dispatcher.once('readable', this._dispatch.bind(this))
    } else {
      this._handleMessage(message, this._dispatch.bind(this))
    }
  }

  _handleMessage (message, done) {
    this._state.handleMessage(message, done)
  }

  _outStream () {
    const self = this
    return Through.obj(transform)

    function transform (message, _, callback) {
      message.from = self.id
      this.push(message)
      callback()
    }
  }
}

module.exports = State
