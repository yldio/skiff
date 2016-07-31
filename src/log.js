'use strict'

const assert = require('assert')
const debug = require('debug')('skiff.log')

class Log {

  constructor (lastLogIndex, lastLogTerm, persistedState) {
    this._lastLogIndex = lastLogIndex || 0
    this._lastLogTerm = lastLogTerm || 0
    this._lastApplied = 0
    this._entries = []
  }

  push (command) {
    const logIndex = ++this._lastLogIndex

    this._entries.push({
      t: this._lastLogTerm, // term
      i: this._logIndex, //index
      b: command, // body
    })

    return logIndex
  }

  head () {
    return this._entries[this._entries.length - 1]
  }

  atLogIndex (index) {
    const entry = this._entries[index - 1]
    if (entry) {
      assert.equal(entry.i, index)
    }
    return entry
  }

  commit (index, done) {
    debug('commit')
    setTimeout(() => {
      this._lastApplied = index
      done()
    }, 0)
  }
}

module.exports = Log
