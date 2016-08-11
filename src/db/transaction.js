'use strict'

class Transaction {

  constructor (db) {
    this.db = db
    this._commands = []
  }

  push (command) {
    this._commands.push(command)
  }

  commit (done) {
    this.db.exec(this._commands, done)
  }

}

module.exports = Transaction
