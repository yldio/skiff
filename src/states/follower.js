'use strict'

const debug = require('debug')('skiff.states.follower')
const Base = require('./base')

class Follower extends Base {

  start () {
    debug('%s is follower', this._node.state.id)
    super.start()
  }

}

module.exports = Follower
