'use strict'

const debug = require('debug')('skiff.node')
const merge = require('deepmerge')
const Multiaddr = require('multiaddr')

const PassiveNetwork = require('./network/passive')
const ActiveNetwork = require('./network/active')
const IncomingDispatcher = require('./incoming-dispatcher')
const State = require('./state')

const defaultOptions = {
  server: {},
  rpcTimeoutMS: 5000
}

class Node {

  constructor (id, _options) {
    debug('creating node %s with options %j', id, _options)
    this.id = id
    this._options = merge(defaultOptions, _options || {})
    this._dispatcher = new IncomingDispatcher()
    this._state = new State(this.id, this._dispatcher, this._options)
  }

  start (cb) {
    debug('starting node %s', this.id)
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
      passiveNetwork.once('listening', () => cb()) // do not carry event args into callback
    }

    this._network = {
      passive: passiveNetwork,
      active: new ActiveNetwork()
    }

    this._network.passive.pipe(this._dispatcher, { end: false })
    this._network.active.pipe(this._dispatcher, { end: false })

    this._state.passive.pipe(this._network.passive, { end: false })
    this._state.active.pipe(this._network.active, { end: false })
  }

  stop (cb) {
    if (cb) {
      this._network.passive.once('closed', cb)
    }
    if (this._network) {
      this._network.passive.end()
      this._network.active.end()
    }

    this._state.stop()

    delete this._network
  }

  join (address) {
    this._state.join(address)
  }

  command (command, done) {
    this._state.command(command, done)
  }

  is (state) {
    const currentState = this._state._stateName
    debug('%s: current state is %s', this.id, currentState)
    return this._state._stateName === state
  }
}

module.exports = Node
