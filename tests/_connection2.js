'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;


module.exports = Connection2;

function Connection2(from, to, hub) {
  var self = this;

  EventEmitter.call(this);

  this.from = from;
  this.to = to;
  this.hub = hub;

  setTimeout(function() {
    var listener = self.hub.listens[to];

    if (listener) {
      listener.call(null, self.from, self);
    }
  }, 5);
}

inherits(Connection2, EventEmitter);

var C = Connection2.prototype;

C.send = function send(type, args, cb) {
  var self = this;

  setTimeout(function() {
    var to = self.hub.connections[self.to];
    var fn = to && to[self.from];
    if (fn) {
      fn.call(null, type, args, cb);
    }
    else {
      cb.call(null, new Error('cannot connect to ' + self.to));
    }
  }, 5);
};

C.receive = function listen(cb) {
  if (! this.hub.connections[this.to]) {
    this.hub.connections[this.to] = {};
  }
  this.hub.connections[this.to][this.from] = cb;
};

C.close = function close(cb) {
  var self = this;

  var to = this.hub.connections[this.to];
  var from = to && to[from];
  if (from) delete to[from];

  from = this.hub.connections[this.from];
  to = from && from[to];
  if (to) delete from[to];

  setTimeout(function() {
    self.emit('close');
    if (cb) {
      cb();
    }
  }, 5);
};