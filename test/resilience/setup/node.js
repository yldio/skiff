'use strict'

const fork = require('child_process').fork
const path = require('path')
const split = require('split')

const channels = ['stdout', 'stderr']

class Node {
  constructor (address, options) {
    this._address = address
    this._options = options
    this._exiting = false
  }

  start (done) {
    const args = [this._address, JSON.stringify(this._options)]
    this._child = fork(path.join(__dirname, 'server.js'), args, {
      silent: true
    });

    channels.forEach(channel => {
      this._child[channel].pipe(split())
        .on('data', line => {
          line = line.trim()
          if (line) {
            process[channel].write(`${this._address} (${this._child.pid}): ${line}\n`)
          }
        })
    })

    this._child.stdout.pipe(split()).once('data', (line) => {
      if (line.match(/started/)) {
        done()
      } else if (!this._exiting) {
        done(new Error(`Could not start child, first line of output was ${line}`))
      } else {
        done()
      }
    })

    this._child.once('exit', (code, signal) => {
      if (!this._exiting) {
        throw new Error(`child exited without being asked to, code = ${code}, signal = ${signal}`)
      }
    })
  }

  stop (done) {
    this._exiting = true
    this._child.once('exit', () => {
      done()
    })
    this._child.kill()
  }
}

module.exports = Node
