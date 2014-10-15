'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = Connection2;

function Connection2(local, remote, hub, secondary) {
  var self = this;

  EventEmitter.call(this);

  this.local = local;
  this.remote = remote;
  this.hub = hub;

  hub.connected(local, remote);
  hub.connected(remote, local);

  if (!secondary) {
    setTimeout(function() {
      var listener = self.hub.listens[remote];

      if (listener) {
        var otherConnection = new Connection2(
          self.remote, self.local, hub, true);

        listener.call(null, self.local, otherConnection);
      }
    }, 5);
  }
}

inherits(Connection2, EventEmitter);

var C = Connection2.prototype;

C.send = function send(type, args, cb) {
  var self = this;

  setTimeout(function() {
    var local = self.hub.connections[self.local];
    var fn = local && local[self.remote];
    if (fn) {
      fn.call(null, type, args, cb);
    }
    else {
      cb.call(null, new Error('cannot connect remote ' + self.remote));
    }
  }, 5);
};

C.receive = function receive(cb) {
  if (!this.hub.connections[this.remote]) {
    this.hub.connections[this.remote] = {};
  }
  this.hub.connections[this.remote][this.local] = cb;
};

C.close = function close(cb) {
  var self = this;

  if (this.hub.disconnected(this.local, this.remote)) {
    var local = this.hub.connections[this.local];
    if (local) {
      delete local[this.remote];
    }
  }

  if (this.hub.disconnected(this.remote, this.local)) {
    var remote = this.hub.connections[this.remote];
    if (remote) {
      delete remote[this.local];
    }
  }

  setTimeout(function() {
    self.emit('close');
    if (cb) {
      cb();
    }
  }, 5);
};
