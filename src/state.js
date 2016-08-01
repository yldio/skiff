'use strict'

const debug = require('debug')('skiff.state')
const Through = require('through2')
const uuid = require('uuid').v4
const timers = require('timers')
const once = require('once')
const EventEmitter = require('events')

const States = require('./states')
const Log = require('./log')

class State extends EventEmitter {

  constructor (id, dispatcher, options) {
    super()
    this.id = id
    this._options = options
    this._dispatcher = dispatcher
    this.passive = this._outStream()
    this.active = this._outStream()
    this._replies = this._replyStream()
    this._peers = []
    this._stateName = undefined

    // state
    this._term = 0
    this._lastLogIndex = 0
    this._lastLogTerm = 0
    this._commitIndex = 0
    this._votedFor = null

    this._log = new Log({
      id: this.id,
      commitIndex: this._getOrSetCommitIndex.bind(this),
    })

    this._stateServices = {
      id: id,
      name: this._getStateName.bind(this),
      term: this._getTerm.bind(this),
      lastLogIndex: this._getLastLogIndex.bind(this),
      lastLogTerm: this._getLastLogTerm.bind(this),
      commitIndex: this._getOrSetCommitIndex.bind(this),
      transition: this._transition.bind(this),
      incrementTerm: this._incrementTerm.bind(this),
      getVotedFor: this._getVotedFor.bind(this),
      setVotedFor: this._setVotedFor.bind(this)
    }

    this._networkingServices = {
      rpc: this._rpc.bind(this),
      reply: this._reply.bind(this),
      isMajority: this._isMajority.bind(this),
      peers: this._peers
    }

    this._transition('follower')

    this._dispatch()
  }

  stop () {
    if (this._state) {
      this._state.stop()
    }
  }

  // -------------
  // Peers

  join (address) {
    this._ensurePeer(address)
  }

  _ensurePeer (address) {
    if ((this._peers.indexOf(address) < 0) && address !== this.id) {
      debug('%s is joining %s', this.id, address)
      this._peers.push(address)
    }
  }

  _isMajority (count) {
    const quorum = Math.ceil((this._peers.length + 1) / 2)
    const isMajority = this._peers.length && count >= quorum
    debug('%s: is %d majority? %j', this.id, count, isMajority)
    return isMajority
  }

  // -------------
  // Internal state

  _transition (state, force) {
    if (force || state !== this._stateName) {
      debug('node %s is transitioning to state %s', this.id, state)
      const oldState = this._state
      if (oldState) {
        oldState.stop()
      }

      const State = States(state)
      this._state = new State({
        state: this._stateServices,
        network: this._networkingServices,
        log: this._log
      })
      this._stateName = state
      this._state.start()

      this.emit('new state', state)
      this.emit(state)
    }
  }

  _getStateName () {
    return this._stateName
  }

  _incrementTerm () {
    this._votedFor = null
    return ++this._term
  }

  _getTerm () {
    return this._term
  }

  _setTerm (term) {
    this._votedFor = null
    this._term = term
    this._log.setTerm(term)
    return this._term
  }

  _getLastLogIndex () {
    return this._lastLogIndex
  }

  _getLastLogTerm () {
    return this._lastLogTerm
  }

  _getOrSetCommitIndex (idx) {
    if (typeof idx === 'number') {
      debug('%s: setting commit index to %d', this.id, idx)
      this._commitIndex = idx
    }
    return this._commitIndex
  }

  _getVotedFor () {
    return this._votedFor
  }

  _setVotedFor (peer) {
    debug('%s: setting voted for to %s', this.id, peer)
    this._votedFor = peer
  }

  // -------------
  // Networking

  _rpc (to, action, params, callback) {
    debug('%s: rpc to: %s, action: %s, params: %j', this.id, to, action, params)
    const self = this
    const done = once(callback)
    const id = uuid()
    const timeout = timers.setTimeout(onTimeout, this._options.rpcTimeoutMS)
    this._replies.on('data', onReplyData)
    this.active.write({
      from: this.id,
      id,
      type: 'request',
      to,
      action,
      params
    })

    function onReplyData (message) {
      debug('%s: reply data: %j', self.id, message)
      if (message.type === 'reply' && message.from === to && message.id === id) {
        debug('%s: this is a reply I was expecting: %j', self.id, message)
        self._replies.removeListener('data', onReplyData)
        timers.clearTimeout(timeout)
        done(null, message)
      }
    }

    function onTimeout () {
      debug('RPC timeout')
      self._replies.removeListener('data', onReplyData)
      const err = new Error('timeout RPC to ' + to)
      err.code = 'ETIMEOUT'
      done(err)
    }
  }

  _reply (to, messageId, params, callback) {
    debug('%s: replying to: %s, messageId: %s, params: %j', this.id, to, messageId, params)
    this.passive.write({
      to,
      type: 'reply',
      from: this.id,
      id: messageId,
      params
    }, callback)
  }

  _dispatch () {
    const message = this._dispatcher.next()
    if (!message) {
      this._dispatcher.once('readable', this._dispatch.bind(this))
    } else {
      debug('%s: got message from dispatcher: %j', this.id, message)

      if (message.params) {
        if (message.params.leaderId) {
          this._leaderId = message.params.leaderId
        }

        debug('%s: current term: %d', this.id, this._term)
        if (message.params.term > this._term) {
          debug('%s is going to transition to state follower because of outdated term', this.id)
          this._setTerm(message.params.term)
          this._transition('follower')
        }
      }

      if (message.type === 'request') {
        debug('%s: request message from dispatcher: %j', this.id, message)
        this._handleRequest(message, this._dispatch.bind(this))
      } else if (message.type === 'reply') {
        debug('%s: reply message from dispatcher: %j', this.id, message)
        this._handleReply(message, this._dispatch.bind(this))
      }
    }
  }

  _handleRequest (message, done) {
    debug('%s: handling message: %j', this.id, message)
    const from = message.from
    if (from) {
      this._ensurePeer(from)
      this._state.handleRequest(message, done)
    }
  }

  _handleReply (message, done) {
    debug('%s: handling reply %j', this.id, message)
    this._replies.write(message, done)
  }

  _outStream () {
    const self = this
    return Through.obj(transform)

    function transform (message, _, callback) {
      debug('%s: out stream transform %j', self.id, message)
      message.from = self.id
      this.push(message)
      callback()
    }
  }

  _replyStream () {
    const self = this
    const stream = Through.obj(transform)
    stream.setMaxListeners(Infinity)
    return stream

    function transform (message, _, callback) {
      debug('%s: reply stream transform %j', self.id, message)
      this.push(message)
      callback()
    }
  }

  //-------
  // Commands

  command (command, done) {
    if (this._stateName !== 'leader') {
      const err = new Error('not the leader')
      err.code = 'ENOTLEADER'
      err.leader = this._leaderId
      done(err)
    } else {
      this._state.command(command, err => {
        debug('command %s finished, err = %j', command, err)
        done(err)
      })
    }
  }
}

module.exports = State
