'use strict'

const debug = require('debug')('skiff.states.candidate')
const Base = require('./base')

class Candidate extends Base {

  start () {
    debug('%s is candidate', this._node.state.id)
    this.name = 'candidate'
    super.start()
    this._node.state.incrementTerm()
    // vote for self
    this._node.state.setVotedFor(this._node.state.id)
    process.nextTick(this._gatherVotes.bind(this))
  }

  _gatherVotes () {
    let majorityReached = false
    let votedForMe = 1
    let voteCount = 1

    this._node.network.peers.forEach(peer => {
      debug('candidate requesting vote from %s', peer)
      const requestVoteArgs = {
        term: this._node.state.term(),
        candidateId: this._node.state.id,
        lastLogIndex: this._node.log._lastLogIndex,
        lastLogTerm: this._node.log._lastLogTerm
      }

      this._node.network.rpc(
        {
          to: peer,
          action: 'RequestVote',
          params: requestVoteArgs
        },
        (err, reply) => { // callback
          if (!majorityReached) {
            voteCount++
            if (reply && reply.params.voteGranted) {
              votedForMe++
              if (this._node.network.isMajority(votedForMe)) {
                // won
                majorityReached = true
                debug('%s: election won', this._node.state.id)
                this._node.state.transition('leader')
              }
            }
            if (this._node.network.isMajority(voteCount - votedForMe)) {
              // lost
              debug('%s: election lost', this._node.state.id)
              majorityReached = true
              this._resetElectionTimeout()
            }
          }
        }
      )
    })
  }
}

module.exports = Candidate
