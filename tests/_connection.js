'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = Connection;

function Connection(id, hub) {

  EventEmitter.call(this);

  this.id = id;
  this.hub = hub;
}

inherits(Connection, EventEmitter);

var C = Connection.prototype;

C.invoke = function invoke(type, args, cb) {
  var self = this;

  setTimeout(function() {
    var fn = self.hub.out[self.id];
    if (fn) {
      fn.call(null, type, args, cb);
    }
    else {
      cb.call(null, new Error('cannot connect to ' + self.id));
    }
  }, 5);
};

C.listen = function listen(cb) {
  this.hub.in[this.id] = cb;
};

C.close = function(cb) {
  var self = this;

  if (this.hub.out[this.id]) delete this.hub.out[this.id];
  if (this.hub.in[this.id]) delete this.hub.in[this.id];
  setTimeout(function() {
    self.emit('close');
    if (cb) {
      cb();
    }
  }, 5);
};
