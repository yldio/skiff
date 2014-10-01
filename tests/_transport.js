'use strict';

var Connection = require('./_connection');

var hub = {
  in: {},
  out: {}
};

exports.connect = connect;

function connect(options) {
  return new Connection(options, hub);
}

exports.listen = listen;

function listen(id, fn) {
  hub.out[id] = fn;
}

exports.invoke = invoke;

function invoke(id) {
  var fn = hub.in[id];
  if (fn) {
    var args = Array.prototype.slice.call(arguments);
    args.shift();
    fn.apply(null, args);
  }
}