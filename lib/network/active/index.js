const Network = require('./network')

module.exports = createNetwork

function createNetwork (address, options) {
  return new Network(address, options)
}
