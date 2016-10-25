'use strict'

const join = require('path').join

module.exports = {
  network: undefined,
  server: {},
  rpcTimeoutMS: 2000,
  peers: [],
  levelup: {
    keyEncoding: 'utf8',
    valueEncoding: 'json'
  },
  location: join(__dirname, '..', 'data'),
  electionTimeout: true,
  appendEntriesIntervalMS: 100,
  electionTimeoutMinMS: 300,
  electionTimeoutMaxMS: 600,
  installSnapshotChunkSize: 10,
  batchEntriesLimit: 10,
  clientRetryRPCTimeout: 200,
  clientMaxRetries: 10,
  waitBeforeLeaveMS: 4000
}
