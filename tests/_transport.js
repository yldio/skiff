'use strict';

var Connection = require('./_connection');

var hub = {
  in: {},
  out: {}
};

exports.connect = connect;

function connect(local, options) {
  return new Connection(options, hub);
}

exports.listen = listen;

function listen(id, fn) {
  hub.out[id] = fn;
}

exports.invoke = invoke;

function invoke(id) {
  var args = Array.prototype.slice.call(arguments);
  process.nextTick(function() {
    var fn = hub.in[id];
    if (fn) {
      args.shift();
      fn.apply(null, args);
    }
  });
}
