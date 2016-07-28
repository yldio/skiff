'use strict'

const Base = require('./base')

class Candidate extends Base {

  constructor (node, options) {
    super(node, options)
    this._votes = 1
  }

  start () {
    let haveMajority = false

    this._node.network.peers.forEach(peer => {
      const requestVoteArgs = {
        term: this._node.state.term(),
        candidateId: this._node.state.id,
        lastLogIndex: this._node.state.lastLogIndex(),
        lastLogTerm: this._node.state.lastLogTerm()
      }

      this._node.network.rpc(
        peer, // to
        'RequestVote', // action
        requestVoteArgs, // params
        (err, reply) => {
          if (!haveMajority && !err && reply.voteGranted) {
            this._votes ++
            haveMajority = this._node.network.isMajority(this._votes)
            if (haveMajority) {
              this._electionWon()
            }
          }
        }
      )
    })
  }

  stop () {}

  _electionWon () {
    this._node.state.setState('leader')
  }
}

module.exports = Candidate
