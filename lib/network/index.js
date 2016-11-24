'use strict'

const PassiveNetwork = require('./passive')
const ActiveNetwork = require('./active')

module.exports = createNetwork

function createNetwork (options) {
  const passive = new PassiveNetwork(options.passive)
  const address = passive.address().networkAddress()
  const active = new ActiveNetwork(address, options.active)
  return { active, passive }
}
