'use strict';

module.exports = Connection;

function Connection(id, hub) {
  this.id = id;
  this.hub = hub;
}

var C = Connection.prototype;

C.invoke = function invoke(type, args, cb) {
  var fn = this.hub[this.id];
  if (fn)
    fn.call(null, type, args, cb);
  else
    cb.call(new Error('cannot connect to ' + this.id));
};

C.listen = function listen() {

};