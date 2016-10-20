'use strict'

const debug = require('debug')('skiff.states.candidate')
const Base = require('./base')

class Candidate extends Base {

  start () {
    debug('%s is candidate', this.id)
    this.name = 'candidate'
    super.start()
    this._stopped = false
    this._node.state.incrementTerm()
    // vote for self
    this._node.state.setVotedFor(this.id)
    process.nextTick(this._gatherVotes.bind(this))
  }

  stop () {
    super.stop()
    this._stopped = true
  }

  _gatherVotes () {
    debug('gathering votes...')
    const self = this
    let majorityReached = false
    let votedForMe = 1
    let voteCount = 1

    maybeDone()

    this._node.network.peers().forEach(peer => {
      debug('candidate requesting vote from %s', peer)
      const requestVoteArgs = {
        term: this._node.state.term(),
        candidateId: this.id,
        lastLogIndex: this._node.log._lastLogIndex,
        lastLogTerm: this._node.log._lastLogTerm
      }

      this._node.network.rpc(
        {
          to: peer,
          action: 'RequestVote',
          params: requestVoteArgs
        },
        // eslint-disable-next-line handle-callback-err
        (err, reply) => { // callback
          voteCount++
          if ((!this._stopped) && reply && reply.params.voteGranted) {
            votedForMe++
            maybeDone()
          }
        }
      )
    })

    function maybeDone () {
      debug('maybeDone()')
      if (!majorityReached) {
        if (self._node.network.isMajority(votedForMe)) {
          // won
          majorityReached = true
          debug('%s: election won', self.id)
          self._node.state.transition('leader')
        } else {
          debug('still don\'t have majority')
        }
        if (self._node.network.isMajority(voteCount - votedForMe)) {
          // lost
          debug('%s: election lost', self.id)
          majorityReached = true
          self._resetElectionTimeout()
        }
      }
    }
  }
}

module.exports = Candidate
