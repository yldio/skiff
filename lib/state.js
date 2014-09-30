'use strict';

module.exports = State;

function State() {
  this.stopped = false;
}

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