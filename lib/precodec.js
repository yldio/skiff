'use strict';

var join = '#';
var separate = '!';

exports.encode = function encode(e) {
  return separate + e[0].join(join) + separate + e[1];
};

exports.decode = function decode(s) {
  var i = s.indexOf(separate, 1);
  return [s.substring(1, i).split(join).filter(Boolean), s.substring(++i)];
};

exports.buffer = false;

exports.lowerBound = '\x00';
exports.upperBound = '\xff';
