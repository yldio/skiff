const Network = require('./network')

module.exports = createNetwork

function createNetwork (options) {
  return new Network(options)
}
