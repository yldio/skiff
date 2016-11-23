'use strict'

const equal = require('./equal')

const Transform = require('stream').Transform
const extend = require('deep-extend')

const defaultOptions = {
  objectMode: true
}

module.exports = class Encoder extends Transform {
  constructor (schema, options) {
    super(extend({}, defaultOptions, options))
    this.type = schema
  }

  _transform (chunk, encoding, cb) {
    const encoded = this.type.toBuffer(chunk)

    // check
    const decoded = this.type.fromBuffer(encoded, null, true)

    if (!equal(chunk, decoded)) {
      console.error('different:\n%j\n%j\n', chunk, decoded)
      throw new Error('different')
    }

    cb(null, encoded)
  }
}
