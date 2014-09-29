var uuid = require('cuid');
var Connection = require('./_connection');

var hub = exports.hub = {};

exports.connect = connect;

function connect(options) {
  return new Connection(options, hub);
}

exports.listen = listen;

function listen(id, fn) {
  hub[id] = fn;
}