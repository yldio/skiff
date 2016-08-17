'use strict'

const AbstractLevelDown = require('abstract-leveldown').AbstractLevelDOWN

class LevelDown extends AbstractLevelDown {

  constructor (node) {
    super(node.id)
    this._node = node
  }

  _close (callback) {
    this._node.stop(callback)
  }

  _get (key, options, callback) {
    this._node.command({type: 'get', key}, options, callback)
  }

  _put (key, value, options, callback) {
    this._node.command({type: 'put', key, value}, options, callback)
  }

  _del (key, options, callback) {
    this._node.command({type: 'del', key}, options, callback)
  }

  _batch (array, options, callback) {
    this._node.command(array, options, callback)
  }

  _iterator (options) {
    return this._node.iterator(options)
  }

}

module.exports = LevelDown
