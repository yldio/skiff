'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Follower;

function Follower(node, options) {
  var self = this;

  State.call(this);

  this.node = node;
  this.options = options;
  this.node.startElectionTimeout();

  this.node.on('election timeout', this.unlessStopped(onElectionTimeout));

  function onElectionTimeout() {
    self.node.toState('candidate');
  }
}

inherits(Follower, State);

var F = Follower.prototype;

F.name = 'follower';

F.onAppendEntries = function onAppendEntries(args, cb) {
  var self = this;
  var logEntry;

  if (args.prevLogIndex) logEntry = this.node.log[args.prevLogIndex - 1];

  if (args.term < this.node.currentTerm()) callback(false);
  else if (args.prevLogIndex && ! logEntry) callback(false);
  else if (logEntry.term != args.prevLogTerm) callback(false);
  else acceptEntries();

  function callback(success) {
    cb(null, {term: self.node.currentTerm(), success: success});
  }

  function acceptEntries() {

  }
};