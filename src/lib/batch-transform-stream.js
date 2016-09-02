'use strict'

const Transform = require('stream').Transform

const defaultOptions = {
  batchSize: 10,
  objectMode: true
}

class BatchTransformStream extends Transform {

  constructor (_options) {
    const options = Object.assign({}, defaultOptions, _options || {})
    super(options)
    this._options = options
    this._chunks = []
    this._finished = false
  }

  _transform (chunk, enc, callback) {
    this._chunks.push(chunk)
    process.nextTick(() => {
      this._maybePush()
      callback()
    })
  }

  _maybePush () {
    if (this._chunks.length >= this._options.batchSize) {
      this._definitelyPush()
    }
  }

  _definitelyPush () {
    const chunks = this._chunks
    this._chunks = []
    this.push({
      finished: this._finished,
      chunks
    })
  }

  _flush () {
    this._finished = true
    this._definitelyPush()
  }
}

module.exports = BatchTransformStream
