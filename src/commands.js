'use strict'

const debug = require('debug')('skiff.commands')

class Commands {

  constructor (id, queue, state, db) {
    this.id = id
    this._queue = queue
    this._state = state
    this._db = db
    this._dispatch()
  }

  _dispatch () {
    const commandMessage = this._queue.next()
    if (!commandMessage) {
      this._queue.once('readable', this._dispatch.bind(this))
    } else {
      const command = commandMessage.command
      const callback = commandMessage.callback
      debug('%s: got command from queue: %j', this.id, command)
      this._handleCommand(command, (err, result) => {
        if (callback) {
          callback(err, result)
        }
        process.nextTick(this._dispatch.bind(this))
      })
    }
  }

  _handleCommand (command, done) {
    const transaction = this._db.transaction()

    this._state.command(transaction, command, (err, result) => {
      if (err) {
        done(err)
      } else {
        transaction.commit((err) => {
          if (err) {
            done(err)
          } else {
            done(null, result)
          }
        })
      }
    })
  }
}

module.exports = Commands
