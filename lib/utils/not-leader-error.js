'use strict'

class NotLeaderError extends Error {
  constructor (leader) {
    super('not the leader')
    this.code = 'ENOTLEADER'
    this.leader = leader
  }
}

module.exports = NotLeaderError
