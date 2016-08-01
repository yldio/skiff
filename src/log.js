'use strict'

const assert = require('assert')
const debug = require('debug')('skiff.log')

class Log {

  constructor (node, lastLogIndex, lastLogTerm, persistedState) {
    this._node = node
    this._lastLogIndex = lastLogIndex || 0
    this._lastLogTerm = lastLogTerm || 0
    this._commitIndex = 0
    this._lastApplied = 0
    this._entries = []
  }

  push (command) {
    const newLogIndex = ++this._lastLogIndex
    const newEntry = {
      t: this._lastLogTerm, // term
      i: newLogIndex, // index
      c: command // command
    }
    debug('%s: about to push new entry %j', this._node.id, newEntry)

    this._entries.push(newEntry)
    this._lastLogIndex = newLogIndex

    return newLogIndex
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

  appendAfter (index, entries) {
    debug('%s: append after %d: %j', this._node.id, index, entries)
    // truncate
    let head
    while ((head = this.head()) && head.i > index) {
      this._entries.pop()
    }

    for (let i = 0; i < entries.length; i++) {
      this._entries.push(entries[i])
    }
  }

  commit (index, done) {
    debug('%s: commit %d', this._node.id, index)
    setTimeout(() => {
      this._commitIndex = index
      this._lastApplied = index // TODO: ???
      debug('%s: done commiting index %d', this._node.id, index)
      done()
    }, 0)
  }

  setTerm (t) {
    this._lastLogTerm = t
  }
}

module.exports = Log
