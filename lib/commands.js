'use strict'

const debug = require('debug')('skiff.commands')

class Commands {

  constructor (id, queue, state) {
    this.id = id
    this._queue = queue
    this._state = state
    this._dispatch()
  }

  _dispatch () {
    const commandMessage = this._queue.next()
    if (!commandMessage) {
      this._queue.once('readable', this._dispatch.bind(this))
    } else {
      const command = commandMessage.command
      const callback = commandMessage.callback
      const options = commandMessage.options
      debug('%s: got command from queue: %j', this.id, command)
      this._handleCommand(command, options, (err, result) => {
        if (callback) {
          callback(err, result)
        }
        process.nextTick(this._dispatch.bind(this))
      })
    }
  }

  _handleCommand (command, options, done) {
    this._state.command(command, options, done)
  }
}

module.exports = Commands
