'use strict'

const Transform = require('stream').Transform
const extend = require('deep-extend')
const avro = require('avsc')

const defaultOptions = {
  objectMode: true
}

module.exports = class Decoder extends Transform {
  constructor (schema, options) {
    super(extend({}, defaultOptions, options))
    this.type = schema
  }

  _transform (chunk, encoding, cb) {
    cb(null, this.type.fromBuffer(chunk, null, true))
  }
}
