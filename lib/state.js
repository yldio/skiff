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

S.stop = function stop() {
  this.stopped = true;
  this.emit('stopped');
};

S.unlessStopped = function unlessStopped(fn) {
  var self = this;

  return function() {
    if (! self.stopped) fn.apply(this, arguments);
  };
};

S.onRequestVote = function onRequestVote(args, cb) {
  cb(null, {term: this.node.currentTerm(), voteGranted: false});
};