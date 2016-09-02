'use strict'

const debug = require('debug')('skiff.states.candidate')
const Base = require('./base')

class Candidate extends Base {

  _start () {
    this._gatherVotes()
  }

  _gatherVotes () {
    let majorityVoted = false
    let votedForMe = 1
    let voteCount = 1

    this._node.state.setVotedFor(this._node.state.id)

    this._node.network.peers.forEach(peer => {
      debug('requesting vote from %s', peer)
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
          if (!err && !majorityVoted) {
            debug('reply for request vote from %s: err = %j, message = %j', peer, err, reply)
            voteCount++
            majorityVoted = this._node.network.isMajority(voteCount)
            if (reply && reply.params.voteGranted) {
              votedForMe++
              if (this._node.network.isMajority(votedForMe)) {
                this._electionWon()
              }
            } else if (majorityVoted) {
              this._resetElectionTimeout()
            }
          }
        }
      )
    })
  }

  _electionWon () {
    debug('%s: election won', this._node.state.id)
    this._node.state.transition('leader')
  }
}

module.exports = Candidate
