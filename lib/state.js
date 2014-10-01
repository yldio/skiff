'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = State;

function State() {
  EventEmitter.call(this);
  this.stopped = false;
}

inherits(State, EventEmitter);

var S = State.prototype;

S.stop = function() {
  this.stopped = true;
};

S.unlessStopped = function(fn) {
  var self = this;

  return function() {
    if (! self.stopped) fn.apply(this, arguments);
  };
};