'use strict'

const Multiaddr = require('multiaddr')

class Address {

  constructor (addr) {
    if (typeof addr === 'object') {
      addr = `/ip4/${addr.host}/tcp/${addr.port}`
    }
    this._address = addr
    this._multiAddr = Multiaddr(this.networkAddress())
  }

  networkAddress () {
    return this._address.toString().split('/').slice(0, 5).join('/')
  }

  nodeAddress () {
    return this._multiAddr.nodeAddress()
  }

  toString () {
    return this._address
  }

  toJSON () {
    return this._address
  }
}

module.exports = createAddress

function createAddress (addr) {
  if (addr instanceof Address) {
    return addr
  }
  return new Address(addr)
}
