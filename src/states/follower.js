'use strict'

const debug = require('debug')('skiff.states.follower')
const Base = require('./base')

class Follower extends Base {

  start () {
    debug('%s is follower', this.id)
    this.name = 'follower'
    super.start()
  }

}

module.exports = Follower
