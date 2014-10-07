'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;


module.exports = Connection2;

function Connection2(from, to, hub) {

  EventEmitter.call(this);

  this.from = from;
  this.to = to;
  this.hub = hub;

  if (!hub[from]) {
    hub[from] = {};
  }
  if (!hub[to]) {
    hub[to] = {};
  }
}

inherits(Connection2, EventEmitter);

var C = Connection2.prototype;

C.invoke = function invoke(type, args, cb) {
  var self = this;

  setTimeout(function() {
    var fn = self.hub[self.from][self.to];
    if (fn) {
      fn.call(null, type, args, cb);
    }
    else {
      cb.call(null, new Error('cannot connect to ' + self.to));
    }
  }, 5);
};

C.listen = function listen(cb) {
  this.hub[this.to][this.from] = cb;
};

C.close = function(cb) {
  var self = this;

  if (this.hub[this.to][this.from]) delete this.hub[this.to][this.from];
  if (this.hub[this.from][this.to]) delete this.hub[this.from][this.to];
  setTimeout(function() {
    self.emit('close');
    if (cb) {
      cb();
    }
  }, 5);
};