'use strict'

require('colors')

const equal = require('./equal')

const Transform = require('stream').Transform
const extend = require('deep-extend')
const avro = require('avsc')

const defaultOptions = {
  objectMode: true
}

module.exports = class Encoder extends Transform {
  constructor (schema, options) {
    super(extend({}, defaultOptions, options))
    this.type = avro.parse(schema)
  }

  _transform (chunk, encoding, cb) {
    // console.log('<- %j'.green, chunk)
    try {
      const encoded = this.type.toBuffer(chunk)
      const decoded = this.type.fromBuffer(encoded, null, true)
      if (! equal(chunk, decoded)) {
        console.error('--------\ndifference found')
        console.error(chunk)
        if (chunk.params && chunk.params.entries) {
          chunk.params.entries.forEach(entry => console.error(entry))
        }
        console.error(decoded)
        console.error('--------')
        cb(new Error('different'))
      } else {
        cb(null, encoded)
      }
    } catch (err) {
      console.log(err.stack)
      err.message = `Error encoding ${JSON.stringify(chunk)}: ${err.message}`
      cb(err)
    }
  }
}
