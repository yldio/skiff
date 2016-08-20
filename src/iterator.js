'use strict'

const once = require('once')
const AbstractIterator = require('abstract-leveldown').AbstractIterator

class Iterator extends AbstractIterator {
  constructor (db, options) {
    super(db)
    this._rs = db.createReadStream(options)
    this._finished = false
    this._error = null
    this._callback = null
    this._rs.once('close', () => {
      this._finished = true
      if (this._callback) {
        this._callback(this._error, null, null)
      }
    })
    this._rs.on('error', err => { this._error = err })
  }

  _next (callback) {
    this._callback = once(callback)
    if (this._finished) {
      callback(null, null, null)
    } else if (this._error) {
      callback(this._error)
    } else {
      const item = this._rs.read()
      if (this._finished) {
        callback(null, null, null)
      } else if (item) {
        callback(null, item.key, item.value)
      } else {
        this._rs.once('readable', () => {
          const item = this._rs.read()
          callback(null, item.key, item.value)
        })
      }
    }
  }

  _end (callback) {
    this._rs.once('close', callback)
    this._rs.destroy()
  }
}

module.exports = Iterator
