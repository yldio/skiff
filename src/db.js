'use strict'

const debug = require('debug')('skiff.db')

const join = require('path').join
const Level = require('level')
const Sublevel = require('level-sublevel')
const Once = require('once')

const defaultDBOptions = {
  keyEncoding: 'binary',
  valueEncoding: 'json'
}

class DB {

  constructor (id, db, _dbOptions) {
    this.id = id
    const dbOptions = Object.assign({}, defaultDBOptions, _dbOptions)
    const dbName = id.replace(/\//g, '-')
    this.db = Sublevel(
      db || Level(join(__dirname, '..', '..', 'data', dbName), dbOptions))

    this.log = this.db.sublevel('log')
    this.meta = this.db.sublevel('meta')
    this.state = this.db.sublevel('state')

    // for debugging purposes
    this.log.toJSON = function () { return 'log' }
    this.meta.toJSON = function () { return 'meta' }
    this.state.toJSON = function () { return 'state' }
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

  command (state, command, done) {
    this._getPersistBatch(state, (err, batch) => {
      if (err) {
        done(err)
      } else {
        const isQuery = (command.type === 'get')
        debug('%s: applying command %j', this.id, command)
        if (!isQuery) {
          batch.push(Object.assign({}, command, { prefix: this.state }))
        }
        debug('%s: going to apply batch: %j', this.id, batch)
        this.db.batch(batch, err => {
          debug('%s: applied batch command err = %j', this.id, err)
          if (!err && isQuery) {
            this.state.get(command.key, done)
          } else {
            done(err)
          }
        })
      }
    })
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
}

module.exports = DB
