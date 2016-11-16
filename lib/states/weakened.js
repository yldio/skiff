'use strict'

const debug = require('debug')('skiff.states.weakened')
const Base = require('./base')

class Weakened extends Base {

  start () {
    debug('%s is weakened', this.id)
    this.name = 'weakened'
    this._stopped = false
    super.start()
    this._node.state.untilNotWeakened(this._noLongerWeakened.bind(this))

    this._node.network.peers().forEach(peer => {
      this._node.network.write({
        from: this.id.toString(),
        to: peer.toString(),
        type: 'broadcast',
        action: 'Quit'
      })
    })
  }

  stop () {
    super.stop()
    this._stopped = true
  }

  _noLongerWeakened () {
    if (!this._stopped) {
      this._node.state.transition('follower')
    }
  }

  _onElectionTimeout () {
    // do nothing
  }

}

module.exports = Weakened
