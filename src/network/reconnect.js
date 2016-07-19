'use strict'

const debug = require('debug')('skiff.reconnect')
const Reconnect = require('reconnect-core')
const net = require('net')

module.exports = Reconnect((maddr) => {
  const nodeAddr = maddr.nodeAddress()
  const addr = {
    port: nodeAddr.port,
    host: nodeAddr.address
  }
  debug('connecting to %j', addr)
  return net.connect(addr)
})
