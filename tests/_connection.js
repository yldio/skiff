module.exports = Connection;

function Connection(id, hub) {
  this.id = id;
  this.hub = hub;
}

var C = Connection.prototype;

C.invoke = function(type, args, cb) {
  var fn = this.hub[this.id];
  if (! fn) {
    cb(new Error('no listener for id ' + this.id));
   } else {
     fn.call(null, type, args, cb);
   }
};