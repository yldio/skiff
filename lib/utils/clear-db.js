'use strict'

const async = require('async')
const once = require('once')

function clearDB (_cb) {
  const queue = async.queue(this.del.bind(this))
  const cb = once(_cb)
  queue.drain = cb

  let hadData = false

  this.createKeyStream()
    .on('data', (key) => {
      hadData = true
      queue.push(key)
    })
    .once('end', () => {
      if (!hadData) {
        cb()
      }
    })
    .once('error', cb)
}

module.exports = clearDB
