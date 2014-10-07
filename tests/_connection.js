'use strict';

module.exports = Connection;

function Connection(id, hub) {
  this.id = id;
  this.hub = hub;
}

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
