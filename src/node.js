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
  rpcTimeoutMS: 2000
}

class Node {

  constructor (id, _options) {
    debug('creating node %s with options %j', id, _options)
    this.id = id
    this._options = merge(defaultOptions, _options || {})
  }

  start (cb) {
    debug('starting server %s', this.id)
    const address = Multiaddr(this.id).nodeAddress()
    const passiveNetworkOptions = {
      server: merge({
        port: address.port,
        host: address.address
      }, this._options.server)
    }
    debug('about to configure passive network for %s with options %j', this.id, passiveNetworkOptions)
    const passiveNetwork = new PassiveNetwork(passiveNetworkOptions)

    if (cb) {
      passiveNetwork.once('listening', () => cb())
    }

    this._network = {
      passive: passiveNetwork,
      active: new ActiveNetwork()
    }

    const dispatcher = new IncomingDispatcher()
    this._network.passive.pipe(dispatcher)

    this._state = new State(this.id, dispatcher, this._options)

    this._state.passive.pipe(this._network.passive)
    this._state.active.pipe(this._network.active)
  }

  stop (cb) {
    if (cb) {
      this._network.passive.once('closed', cb)
    }
    this._network.passive.end()
  }
}

module.exports = Node
