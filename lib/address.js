'use strict'

const Multiaddr = require('multiaddr')

class Address {

  constructor (addr) {
    this._address = addr
    this._multiAddr = Multiaddr(addr.toString().split('/').slice(0, 5).join('/'))
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
