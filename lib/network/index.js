'use strict'

const PassiveNetwork = require('./passive')
const ActiveNetwork = require('./active')

module.exports = createNetwork

function createNetwork (address, options) {
  return {
    active: new ActiveNetwork(address.networkAddress(), options.active),
    passive: new PassiveNetwork(options.passive)
  }
}
