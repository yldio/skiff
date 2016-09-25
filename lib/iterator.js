'use strict'

const AbstractIterator = require('abstract-leveldown').AbstractIterator

class Iterator extends AbstractIterator {
  constructor (db, options) {
    super(db)
    this._rs = db.createReadStream(options)
  }

  _next (callback, _cleanup) {
    if (_cleanup) {
      _cleanup()
    }
    const rs = this._rs
    rs.on('close', onClose)
    rs.on('end', onClose)
    rs.on('finish', onClose)
    rs.on('error', onError)

    const item = this._rs.read()
    if (item) {
      cleanup()
      callback(null, item.key, item.value)
    } else {
      this._rs.once('readable', this._next.bind(this, callback, cleanup))
    }

    function cleanup () {
      rs.removeListener('close', onClose)
      rs.removeListener('end', onClose)
      rs.removeListener('finish', onClose)
      rs.removeListener('error', onError)
    }

    function onClose () {
      cleanup()
      callback()
    }

    function onError (err) {
      cleanup()
      callback(err)
    }
  }

  _end (callback) {
    this._rs.once('close', callback)
    this._rs.destroy()
  }
}

module.exports = Iterator
