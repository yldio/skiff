'use strict'

const debug = require('debug')('skiff.db')

const join = require('path').join
const Level = require('level')
const Sublevel = require('level-sublevel')
const Once = require('once')
const async = require('async')
const ConcatStream = require('concat-stream')

const defaultDBOptions = {
  keyEncoding: 'ascii',
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

  load (done) {
    async.parallel({
      log: cb => {
        const s = this.log.createReadStream()
        s.once('error', cb)
        s.pipe(ConcatStream(entries => {
          cb(null, entries.sort(sortEntries))
        }))
      },
      meta: cb => {
        async.parallel({
          currentTerm: cb => this.meta.get('currentTerm', notFoundIsOk(cb)),
          votedFor: cb => this.meta.get('votedFor', notFoundIsOk(cb))
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
      return function (err) {
        if (err && err.message.match(/not found/i)) {
          cb()
        } else {
          cb(err)
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

  applyEntries (entries, done) {
    const commands = entries.map(entry => Object.assign({}, entry.c, { prefix: this.state }))
    debug('%s: applying entries %j', this.id, commands)
    this.db.batch(commands, done)
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
