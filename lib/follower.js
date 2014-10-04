'use strict';

var async = require('async');
var State = require('./state');
var inherits = require('util').inherits;

module.exports = Follower;

function Follower(node, options) {
  var self = this;

  State.call(this);

  this.node = node;
  this.options = options;
  this.node.startElectionTimeout();

  this.on('election timeout', onElectionTimeout);

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

  this.node.startElectionTimeout();

  if (args.leaderId) this.node.commonState.volatile.leaderId = args.leaderId;

  if (args.prevLogIndex)
    logEntry = this.node.commonState.persisted.log[args.prevLogIndex - 1];

  if (args.term < this.node.currentTerm())
    callback(false);
  else if (args.prevLogIndex && ! logEntry)
    callback(false);
  else if (args.prevLogTerm &&
          (! logEntry || logEntry.term != args.prevLogTerm))
    callback(false);
  else {
    self.node.commonState.persisted.currentTerm = args.term;
    self.node.commonState.volatile.commitIndex =
      Math.min(args.leaderCommit, self.node.commonState.persisted.log.length);
    self.node.commonState.persisted.log.applyEntries(
      args.prevLogIndex, args.entries);

    setImmediate(function() {
      self.node.logApplier.maybePersist();
    });
    callback(true);
  }

  function done(err) {
    cb(err, {term: self.node.currentTerm(), success: ! err});
  }

  function callback(success) {
    cb(null, {term: self.node.currentTerm(), success: success});
  }

};

