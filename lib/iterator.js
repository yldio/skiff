'use strict'

const AbstractIterator = require('abstract-leveldown').AbstractIterator

class Iterator extends AbstractIterator {
  constructor (node, db, options) {
    super(db)
    this.__db = db
    this._node = node
    this._options = options
    this._haveConsensus = false
  }

  _next (callback, _cleanup) {
    if (_cleanup) {
      _cleanup()
    }
    if (!this._haveConsensus) {
      this._node.readConsensus(err => {
        if (err) {
          callback(err)
        } else {
          this._haveConsensus = true
          this._next(callback, _cleanup)
        }
      })
      return
    }
    if (!this._rs) {
      this._rs = this.__db.createReadStream(this._options)
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
