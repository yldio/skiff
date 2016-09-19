'use strict'

const debug = require('debug')('skiff.states.leader')
const async = require('async')

const Base = require('./base')
const PeerLeader = require('../peer-leader')

class Leader extends Base {

  constructor (node, _options) {
    const options = Object.assign({}, _options || {}, { electionTimeout: false })
    super(node, options)
    this.name = 'leader'
  }

  start () {
    debug('%s is leader', this._node.state.id)
    this._followers = this._node.network.peers.reduce((followers, address) => {
      followers[address] = new PeerLeader(address, this._node, this._options)
      return followers
    }, {})
    this._appendEntries(this._node.network.peers)
    super.start()
  }

  stop () {
    Object.keys(this._followers).forEach(address => {
      this._followers[address].stop()
    })
    super.stop()
  }

  join (address) {
    const follower = this._followers[address]
    if (!follower) {
      this._followers[address] = new PeerLeader(address, this._node, this._options)
    }
  }

  leave (address) {
    const follower = this._followers[address]
    if (follower) {
      follower.stop()
      delete this._followers[address]
    }
  }

  peers () {
    return Object.keys(this._followers)
      .map(addr => this._followers[addr])
      .map(peer => peer.state())
  }

  command (consensuses, command, options, done) {
    this._node.log.push(command)
    process.nextTick(() => {
      async.eachSeries(consensuses, this._appendEntries.bind(this), done)
    })
  }

  readConsensus (callback) {
    // TODO: grant consensus if timestamp for last consensus < minimium election timeout
    this._appendEntries(this._node.network.peers, callback)
  }

  _appendEntries (consensus, _done) {
    debug('%s: _appendEntries; consensus = %j', this._node.state.id, consensus)
    if (!consensus || !consensus.length) {
      throw new Error('no consensus group')
    }
    const self = this
    let majorityReached = false
    let voteCount = 1
    let commitCount = 1
    const done = _done || noop

    const log = this._node.log
    const lastEntry = log.head()

    const cancels = consensus
      .map(address => {
        let follower = this._followers[address]
        if (!follower) {
          follower = this._followers[address] = new PeerLeader(address, this._node, this._options)
        }
        return follower
      })
      .map(peer => {
        const expiresAt = Date.now() + this._options.rpcTimeoutMS
        return peer.waitForEntryAppended(lastEntry && lastEntry.i || 0, expiresAt, err => {
          debug('append entries from %s replied', peer._address, err)
          voteCount++
          if (!err) {
            // console.log('%d OK from %s', _counter, peer._address)
            commitCount++
          } else {
            // console.log('%d NOT OK from %s because %s', _counter, peer._address, err.message)
          }
          perhapsDone()
        })
      })

    function perhapsDone () {
      if (!majorityReached) {
        if (isMajority(consensus, commitCount)) {
          majorityReached = true
          debug('%s: majority reached', self._node.state.id)
          // console.log('majority reached')
          cancelAll()
          if (lastEntry) {
            debug('%s: about to commit index %d', self._node.state.id, lastEntry.i)
            log.commit(lastEntry.i, done)
          } else {
            done()
          }
        } else if (isMajority(consensus, voteCount - commitCount)) {
          majorityReached = true
          const err = new Error(`No majority reached in leader ${self._node.state.id}`)
          err.code = 'ENOMAJORITY'
          done(err)
        }
      }
    }

    function cancelAll () {
      cancels.forEach(cancel => cancel())
    }
  }

  _onElectionTimeout () {
    // do nothing, we're the leader
  }
}

module.exports = Leader

function noop () {}

function isMajority (consensus, count) {
  const quorum = Math.ceil((consensus.length + 1) / 2)
  return consensus.length && count >= quorum
}
