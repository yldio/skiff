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

  if (args.prevLogIndex) logEntry = this.node.commonState.persisted.log[args.prevLogIndex - 1];

  if (args.term < this.node.currentTerm()) callback(false);
  else if (args.prevLogIndex && ! logEntry) callback(false);
  else if (args.prevLogTerm && (! logEntry || logEntry.term != args.prevLogTerm)) callback(false);
  else acceptEntries();

  function acceptEntries() {
    async.series([
      storeTerm,
      setCommitIndex,
      applyEntriesToLog,
      save
      ], done);
  }

  function storeTerm(cb) {
    self.node.commonState.persisted.currentTerm = args.term;
    cb();
  }

  function setCommitIndex(cb) {
    self.node.commonState.volatile.commitIndex = Math.min(args.leaderCommit, self.node.commonState.persisted.log.length);
    cb();
  }

  function applyEntriesToLog(cb) {
    self.node.commonState.persisted.log.applyEntries(args.prevLogIndex, args.entries);
    cb();
  }

  function save(cb) {
    self.node.save(cb);
  }

  function done(err) {
    cb(err, {term: self.node.currentTerm(), success: ! err});
  }

  function callback(success) {
    cb(null, {term: self.node.currentTerm(), success: success});
  }

};