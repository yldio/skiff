'use strict';

var Connection2 = require('./_connection2');

var hub = {
  listens: {},
  connections: {}
};

module.exports = exports = Transport;

function Transport(from) {
  this.from = from;
}

var T = Transport.prototype;

T.connect = function connect(to) {
  return new Connection2(this.from, to, hub);
};

T.listen = function listen(options, listener) {
  hub.listens[this.from] = listener;
};