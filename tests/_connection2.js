'use strict';

module.exports = Connection2;

function Connection2(from, to, hub) {
  this.from = from;
  this.to = to;
  this.hub = hub;

  if (! hub[from]) hub[from] = {};
  if (! hub[to]) hub[to] = {};
}

var C = Connection2.prototype;

C.invoke = function invoke(type, args, cb) {
  var self = this;

  process.nextTick(function() {
    var fn = self.hub[self.from][self.to]
    if (fn)
      fn.call(null, type, args, cb);
    else {
      cb.call(null, new Error('cannot connect to ' + self.to));
     }
  });
};

C.listen = function listen(cb) {
  this.hub[this.to][this.from] = cb;
};