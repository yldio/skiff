'use strict'

const join = require('path').join
const Transaction = require('./transaction')
const Level = require('level')
const Sublevel = require('level-sublevel')

const defaultDBOptions = {
  keyEncoding: 'binary',
  valueEncoding: 'json'
}

class DB {

  constructor (id, db, _dbOptions) {
    const dbOptions = Object.assign({}, defaultDBOptions, _dbOptions)
    const dbName = id.replace(/\//g, '-')
    this.db = Sublevel(
      db || Level(join(__dirname, '..', '..', 'data', dbName), dbOptions))
    this.log = this.db.sublevel('log')
    this.meta = this.db.sublevel('meta')
    this.state = this.db.sublevel('state')

    this._executingTransaction = false
    this._lastTransaction = undefined
  }

  transaction () {
    // make sure we don't execute transactions in parallel
    if (this._executingTransaction) {
      let message = 'Race detected, was already executing transaction..'
      if (this._lastTransaction) {
        message += '\n. Previous transaction trace:\n' + this._lastTransaction
      }
      throw new Error(message)
    }

    this._lastTransaction = _captureStackTrace()
    return new Transaction(this)
  }

  exec (commands, done) {
    this.db.batch(commands, done)
  }

}

module.exports = DB

function _captureStackTrace () {
  var err = new Error()
  Error.captureStackTrace(err, _captureStackTrace)
  return err.stack
}
