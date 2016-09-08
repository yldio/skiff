'use strict'

const debug = require('debug')('skiff.state')
const Through = require('through2')
const uuid = require('uuid').v4
const timers = require('timers')
const once = require('once')
const EventEmitter = require('events')
const assert = require('assert')

const States = require('./states')
const Log = require('./log')

class State extends EventEmitter {

  constructor (id, dispatcher, db, options) {
    super()
    this.id = id

    this._options = options
    this._dispatcher = dispatcher
    this._db = db
    this.passive = this._outStream()
    this.active = this._outStream()
    this._replies = this._replyStream()
    this._stateName = undefined

    this._handlingRequest = false // to detect race conditions

    // persisted state
    this._term = 0
    this._votedFor = null
    this._log = new Log(
      {
        id: this.id,
        applyEntries: this._applyEntries.bind(this)
      },
      options)
    this._peers = options.peers

    this._stateServices = {
      id,
      name: this._getStateName.bind(this),
      term: this._getTerm.bind(this),
      setTerm: this._setTerm.bind(this),
      transition: this._transition.bind(this),
      incrementTerm: this._incrementTerm.bind(this),
      getVotedFor: this._getVotedFor.bind(this),
      setVotedFor: this._setVotedFor.bind(this),
      log: this._log,
      db
    }

    this._networkingServices = {
      rpc: this._rpc.bind(this),
      reply: this._reply.bind(this),
      isMajority: this._isMajority.bind(this),
      peers: this._peers
    }

    this._dbServices = {
      snapshot: this._getPersistedState.bind(this),
      logEntries: this._getLogEntries.bind(this),
      applyTopologyCommand: this._applyTopologyCommand.bind(this)
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

  join (address, done) {
    this.command({type: 'join', peer: address}, {}, done)
  }

  leave (address, done) {
    this.command({type: 'leave', peer: address}, {}, done)
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
    debug('%s: asked to transition to state %s', this.id, state)
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
      }, this._options)
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
    const term = ++this._term
    this._log.setTerm(term)
    return term
  }

  _getTerm () {
    return this._term
  }

  _setTerm (term) {
    if (typeof term !== 'number') {
      throw new Error('term needs to be a number and was %j', term)
    }
    this._votedFor = null
    this._term = term
    this._log.setTerm(term)
    return this._term
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

  _rpc (options, callback) {
    debug('%s: rpc to: %s, action: %s, params: %j', this.id, options.to, options.action, options.params)
    console.log('%s: rpc to: %s, action: %s, params: %j', this.id, options.to, options.action, options.params)
    if (typeof options.to !== 'string') {
      throw new Error('need options.to to be a string')
    }
    const term = this._term
    const self = this
    const done = once(callback)
    const id = uuid()
    const timeout = timers.setTimeout(onTimeout, options.timeout || this._options.rpcTimeoutMS)
    this._replies.on('data', onReplyData)
    this.active.write({
      from: this.id,
      id,
      type: 'request',
      to: options.to,
      action: options.action,
      params: options.params
    })

    return cancel

    function onReplyData (message) {
      debug('%s: reply data: %j', self.id, message)
      console.log('%s: reply data: %j', self.id, message)
      if (self._term > term) {
        onTimeout()
      } else if (
        message.type === 'reply' &&
        message.from === options.to &&
        message.id === id)
      {
        debug('%s: this is a reply I was expecting: %j', self.id, message)
        console.log('%s: this is a reply I was expecting: %j', self.id, message)
        cancel()
        done(null, message)
      }
    }

    function onTimeout () {
      debug('RPC timeout')
      cancel()
      const err = new Error('timeout RPC to ' + options.to)
      err.code = 'ETIMEOUT'
      done(err)
    }

    function cancel () {
      self._replies.removeListener('data', onReplyData)
      timers.clearTimeout(timeout)
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
        if (message.params.term < this._term) {
          // discard message if term is greater than current term
          debug('%s: message discarded because term %d is smaller than my current term %d',
            this.id, message.params.term, this._term)
          return this._dispatch()
        }

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
    assert(!this._handlingRequest, 'race: already handling request')
    this._handlingRequest = true

    const from = message.from
    if (from) {
      debug('%s: handling message: %j', this.id, message)
      this._ensurePeer(from)
      this._state.handleRequest(message, err => {
        this.persist(persistError => {
          debug('%s: persisted', this.id)
          this._handlingRequest = false

          if (err) {
            done(err)
          } else {
            done(persistError)
          }
        })
      })
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
      message.from = self.id
      this.push(message)
      callback()
    }
  }

  _replyStream () {
    const stream = Through.obj(transform)
    stream.setMaxListeners(Infinity)
    return stream

    function transform (message, _, callback) {
      this.push(message)
      callback()
    }
  }

  // -------
  // Commands

  command (command, options, done) {
    if (this._stateName !== 'leader') {
      const err = new Error('not the leader')
      err.code = 'ENOTLEADER'
      err.leader = this._leaderId
      done(err)
    } else {
      const consensuses = [this._peers.slice()]

      // joint consensus
      if (command.type === 'join') {
        consensuses.push(this._peers.concat(command.peer))
      } else if (command.type === 'leave') {
        consensuses.push(this._peers.filter(peer => peer !== command.peer))
      }
      this._state.command(consensuses, command, options, (err, result) => {
        debug('command %s finished, err = %j, result = %j', command, err, result)
        if (err) {
          done(err)
        } else {
          this._db.command(this._dbServices, command, options, done)
        }
      })
    }
  }

  readConsensus (callback) {
    if (this._stateName !== 'leader') {
      const err = new Error('not the leader')
      err.code = 'ENOTLEADER'
      err.leader = this._leaderId
      callback(err)
    } else {
      this._state.readConsensus(callback)
    }
  }

  // -------
  // Persistence

  _getPersistedState () {
    return {
      currentTerm: this._term,
      votedFor: this._votedFor,
      peers: this._peers
    }
  }

  _getLogEntries () {
    return this._log.all()
  }

  _applyEntries (entries, done) {
    this._db.applyEntries(entries, this._applyTopologyCommands.bind(this), done)
  }

  _applyTopologyCommands(commands) {
    commands.forEach(this._applyTopologyCommand.bind(this))
  }

  _applyTopologyCommand(command) {
    if (command.type === 'join') {
      if ((command.peer !== this.id) && (this._peers.indexOf(command.peer) === -1)) {
        this._peers = this._peers.concat(command.peer)
        this._state.join(command.peer)
      }
    } else if (command.type === 'leave') {
      this._peers = this._peers.filter(peer => peer !== command.peer)
      this._state.leave(command.peer)
    }
  }

  persist (done) {
    debug('%s: persisting', this.id)
    this._db.persist(this._dbServices, done)
  }

}

module.exports = State
