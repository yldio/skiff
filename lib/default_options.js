'use strict';

var path = require('path');

module.exports = {
  autoListen: true,
  waitLeaderTimeout: 3e3,
  transport: 'tcp-msgpack',
  dbPath: path.normalize(path.join(__dirname, '..', 'db'))
};
