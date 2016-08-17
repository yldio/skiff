'use strict'

const AbstractIterator = require('abstract-leveldown').AbstractIterator

class Iterator extends AbstractIterator {
  constructor (db, state, options) {
    super(db)
    this._state = state
    this._iterator = db.iterator(options)
  }

  _next (callback) {
    this._state.consensus(err => {
      if (err) {
        callback(err)
      } else {
        this._iterator.next(callback)
      }
    })
  }

  _end (callback) {
    this._iterator.end(callback)
  }
}

module.exports = Iterator
