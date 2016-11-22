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
    this.type = avro.parse(schema)
  }

  _transform (chunk, encoding, cb) {
    try {
      const decoded = this.type.fromBuffer(chunk, null, true)
      // console.log('-> %j'.red, decoded)
      cb(null, decoded)
    } catch (err) {
      cb(err)
    }
  }
}
