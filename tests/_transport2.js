'use strict';

var Connection2 = require('./_connection2');

var hub = {
  listens: {},
  connections: {},
  connectionCounts: {},
  connected: function(from, to) {
    var key = from + ':' + to;
    if (!this.connectionCounts[key]) {
      this.connectionCounts[key] = 0;
    }
    this.connectionCounts[key] ++;
  },
  disconnected: function(from, to) {
    var key = from + ':' + to;
    if (this.connectionCounts[key]) {
      this.connectionCounts[key] --;
    }
    return this.connectionCounts[key] === 0;
  }
};

module.exports = exports = Transport;

function Transport(local) {
  this.local = local;
}

var T = Transport.prototype;

T.connect = function connect(local, remote) {
  return new Connection2(local, remote, hub);
};

T.listen = function listen(local, options, listener) {
  hub.listens[local] = listener;
};
