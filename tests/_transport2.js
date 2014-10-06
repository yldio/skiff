'use strict';

var Connection2 = require('./_connection2');

var hub = {};

module.exports = Transport;

function Transport(from) {
  this.from = from;

  return {
    connect: connect
  };

  function connect(to) {
    return new Connection2(from, to, hub);
  }
}
