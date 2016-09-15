'use strict'

const debug = require('debug')('skiff.log')
const assert = require('assert')

const defaultOptions = {
  minLogRetention: 1000
}

class Log {

  constructor (node, options) {
    this._options = Object.assign({}, defaultOptions, options)
    this._node = node
    this._lastLogIndex = 0
    this._firstLogIndex = 0
    this._lastLogTerm = 0
    this._commitIndex = 0
    this._lastApplied = 0
    this._entries = []
  }

  setEntries (entries) {
    this._entries = entries
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
    this._compact()
  }

  head () {
    return this._entries[this._entries.length - 1]
  }

  atLogIndex (index) {
    let entry
    for (let i = this._entries.length - 1; i >= 0; i--) {
      entry = this._entries[i]
      if (!entry) {
        return
      }
      if (entry.i === index) {
        return entry
      }
    }
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
    const last = entries[entries.length - 1]
    if (last) {
      this._lastLogIndex = last.i
      this._lastLogTerm = last.t
    }

    this._compact()
  }

  commit (index, done) {
    if (typeof index !== 'number') {
      throw new Error('index needs to be a number')
    }
    if (typeof done !== 'function') {
      throw new Error('done needs to be a function')
    }
    debug('%s: commit %d', this._node.id, index)
    this._commitIndex = index

    const entriesToApply = this.entriesFromTo(this._lastApplied + 1, this._commitIndex)
      .map(entry => entry.c)
    this._node.applyEntries(entriesToApply, (err) => {
      if (err) {
        done(err)
      } else {
        debug('%s: done commiting index %d', this._node.id, index)
        this._lastApplied = index
        this._compact()
        done()
      }
    })
  }

  setTerm (t) {
    this._lastLogTerm = t
  }

  lastIndexForTerm (term) {
    let entry
    if (this._lastLogTerm === term) {
      return this._lastLogIndex
    }
    for (let i = this._entries.length - 1; i >= 0; i--) {
      entry = this._entries[i]
      if (!entry) {
        return
      }
      if (entry.t === term) {
        return entry.i
      }
    }
  }

  all () {
    return this._entries
  }

  entriesFrom (index) {
    const physicalIndex = this._physicalIndexFor(index)
    if (physicalIndex === -1) {
      return null
    }
    debug('physical index for %d is %d', index, physicalIndex)
    const entries = this._entries.slice(physicalIndex)
    debug('entries from %d are %j', index, entries)
    return entries
  }

  lastAppliedEntry () {
    return this.atLogIndex(this._lastApplied)
  }

  entriesFromTo (from, to) {
    const pFrom = this._physicalIndexFor(from)
    const entries = this._entries.slice(pFrom, pFrom + to - from + 1)
    if (entries.length) {
      assert(entries[0].i === from)
      assert(entries[entries.length - 1].i === to)
    }
    return entries
  }

  _physicalIndexFor (index) {
    debug('physical index for %d', index)
    if (index < this._firstLogIndex) {
      debug('index %d is smaller tham first index %d', index, this._firstLogIndex)
      return -1
    }
    if (index === 0) {
      return 0
    }
    debug('_firstLogIndex is %d', this._firstLogIndex)
    let entry
    for (let i = this._entries.length - 1; i >= 0; i--) {
      entry = this._entries[i]
      if (entry.i === index) {
        return i
      } else if (entry.i < index) {
        return i + 1
      }
    }
    return 0
  }

  _compact () {
    if (this._entries.length > this._options.minLogRetention) {
      const maxPhysicalIndex = this._entries.length - this._options.minLogRetention
      const maxIndex = this._entries[maxPhysicalIndex].i
      let canRemove = maxPhysicalIndex
      if (maxIndex > this._lastApplied) {
        canRemove -= (maxIndex - this._lastApplied)
      }
      this._entries.splice(0, canRemove)
    }
    if (this._entries.length) {
      this._firstLogIndex = this._entries[0].i
    }
  }
}

module.exports = Log
