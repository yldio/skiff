'use strict'

const debug = require('debug')('skiff.db')
const timers = require('timers')
const Sublevel = require('level-sublevel')
const Once = require('once')
const async = require('async')
const ConcatStream = require('concat-stream')
const Leveldown = require('leveldown')
const Levelup = require('levelup')
const clearDB = require('./utils/clear-db')
const join = require('path').join

const ALLOWED_TYPES = ['put', 'del']

class DB {

  constructor (_location, id, db, options) {
    this.id = id
    const dbName = id.toString().replace(/\//g, '_').replace(/\./g, '_')
    const leveldown = db || Leveldown
    const location = join(_location, dbName)
    this._levelup = new Levelup(location, Object.assign({}, options, {db: leveldown}))
    this._leveldown = this._levelup.db
    this.db = Sublevel(this._levelup)

    this.log = this.db.sublevel('log')
    this.meta = this.db.sublevel('meta')
    this.state = this.db.sublevel('state')
    this.state.clear = clearDB

    // for debugging purposes
    this.log.toJSON = function () { return 'log' }
    this.meta.toJSON = function () { return 'meta' }
    this.state.toJSON = function () { return 'state' }
  }

  load (done) {
    async.parallel({
      log: cb => {
        const s = this.log.createReadStream()
        s.once('error', cb)
        s.pipe(ConcatStream(entries => {
          cb(null, entries.sort(sortEntries).map(fixLoadedEntry))
        }))
      },
      meta: cb => {
        async.parallel({
          currentTerm: cb => this.meta.get('currentTerm', notFoundIsOk(cb)),
          votedFor: cb => this.meta.get('votedFor', notFoundIsOk(cb)),
          peers: cb => this.meta.get('peers', notFoundIsOk(cb))
        }, cb)
      }
    }, done)

    function sortEntries (a, b) {
      const keyA = a.key
      const keyB = b.key
      const keyAParts = keyA.split(':')
      const keyBParts = keyB.split(':')
      const aTerm = Number(keyAParts[0])
      const bTerm = Number(keyBParts[0])
      if (aTerm !== bTerm) {
        return aTerm - bTerm
      }
      const aIndex = Number(keyAParts[1])
      const bIndex = Number(keyBParts[1])

      return aIndex - bIndex
    }

    function notFoundIsOk (cb) {
      return function (err, result) {
        if (err && err.message.match(/not found/i)) {
          cb()
        } else {
          cb(err, result)
        }
      }
    }
  }

  persist (state, done) {
    debug('%s: persisting state', this.id)
    this._getPersistBatch(state, (err, batch) => {
      if (err) {
        done(err)
      } else {
        this.db.batch(batch, done)
      }
    })
  }

  command (state, command, options, done) {
    this._getPersistBatch(state, (err, batch) => {
      if (err) {
        done(err)
      } else {
        const isQuery = (command.type === 'get')
        const isTopology = (command.type === 'join' || command.type === 'leave')
        debug('%s: going to apply batch: %j', this.id, batch)
        this.db.batch(batch, err => {
          debug('%s: applied batch command err = %j', this.id, err)
          if (!err) {
            if (isQuery) {
              this.state.get(command.key, done)
            } else if (isTopology) {
              state.applyTopologyCommand(command)
              done()
            } else {
              done()
            }
          } else {
            done(err)
          }
        })
      }
    })
  }

  applyEntries (entries, applyTopology, done) {
    if (entries.length) {
      debug('%s: applying entries %j', this.id, entries)
    }

    let dbCommands = []
    const topologyCommands = []
    entries.forEach(command => {
      if (command.type === 'join' || command.type === 'leave') {
        topologyCommands.push(command)
      } else {
        dbCommands.push(command)
      }
    })
    if (topologyCommands.length) {
      applyTopology(topologyCommands)
    }

    dbCommands = dbCommands.reduce((acc, command) => acc.concat(command), [])

    const batch = dbCommands
      .filter(entry => ALLOWED_TYPES.indexOf(entry.type) >= 0)
      .map(entry => Object.assign(entry, { prefix: this.state }))

    if (batch.length) {
      this.db.batch(batch, done)
    } else {
      timers.setImmediate(done)
    }
  }

  _getPersistBatch (state, done) {
    this._getPersistLog(state, (err, _batch) => {
      if (err) {
        done(err)
      } else {
        done(null, _batch.concat(this._getPersistMeta(state)))
      }
    })
  }

  _getPersistMeta (state) {
    const snapshot = state.snapshot()
    return [
      {
        key: 'currentTerm',
        value: snapshot.currentTerm,
        prefix: this.meta
      },
      {
        key: 'votedFor',
        value: snapshot.votedFor,
        prefix: this.meta
      }
    ]
  }

  _getPersistLog (state, _done) {
    debug('%s: persisting log', this.id)
    const done = Once(_done)
    const entries = state.logEntries()
    const byKey = entries.reduce((acc, entry) => {
      const key = `${entry.t}:${entry.i}`
      acc[key] = entry.c
      return acc
    }, {})
    debug('%s: log by key: %j', this.id, byKey)
    const removeKeys = []
    this.log.createKeyStream()
      .on('data', key => {
        if (!byKey.hasOwnProperty(key)) {
          // remove key not present in the log any more
          removeKeys.push(key)
        } else {
          // remove entries already in the database
          delete byKey[key]
        }
      })
      .once('error', done)
      .once('end', () => {
        debug('%s: will remove keys: %j', this.id, byKey)
        const operations =
          removeKeys.map(removeKey => {
            return {
              type: 'del',
              key: removeKey,
              prefix: this.log
            }
          })
          .concat(Object.keys(byKey).map(key => {
            return {
              type: 'put',
              key: key,
              value: byKey[key],
              prefix: this.log
            }
          }))

        done(null, operations)
      })
  }

  _commandToBatch (command) {
    return (Array.isArray(command) ? command : [command])
      .map(this._transformCommand.bind(this))
  }

  _transformCommand (command) {
    return Object.assign({}, command, { prefix: this.state })
  }

}

function fixLoadedEntry (entry) {
  const keyParts = entry.key.split(':')
  const term = Number(keyParts[0])
  const index = Number(keyParts[1])
  return {
    i: index,
    t: term,
    c: entry.value
  }
}

module.exports = DB
