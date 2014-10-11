'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Follower;

function Follower(node, options) {
  State.call(this, node);

  var self = this;

  this.options = options;
  this.lastHeardFromLeader = undefined;
  this.lastLeader = undefined;

  this.node.startElectionTimeout();

  this.node.commonState.persisted.votedFor = null;

  this.on('election timeout', onElectionTimeout);

  function onElectionTimeout() {
    self.node.toState('candidate');
  }

  this.once('stopped', onceStopped);

  function onceStopped() {
    self.node.cancelElectionTimeout();
  }
}

inherits(Follower, State);

var F = Follower.prototype;

F.name = 'follower';

F.onAppendEntries = function onAppendEntries(args, cb) {
  var self = this;
  var logEntry;

  this.node.startElectionTimeout();

  if (args.leaderId) {
    this.node.commonState.volatile.leaderId = args.leaderId;
  }

  if (args.prevLogIndex) {
    logEntry =
      this.node.commonState.persisted.log.entries[args.prevLogIndex - 1];
  }

  if (args.term < this.node.currentTerm()) {
    callback(false, 'term is < than current term');
  }
  else if (args.prevLogIndex && !logEntry) {
    callback(false, 'local node too far behinf');
  }
  else if (args.prevLogTerm &&
          (!logEntry || logEntry.term != args.prevLogTerm)) {
    callback(false, 'node too far behind');
  }
  else {

    self.lastLeader = args.leaderId;
    self.lastHeardFromLeader = Date.now();

    self.node.commonState.persisted.currentTerm = args.term;

    self.node.commonState.volatile.commitIndex = Math.min(
      args.leaderCommit, self.node.commonState.persisted.log.entries.length);

    self.node.commonState.persisted.log.applyEntries(
      args.prevLogIndex, args.entries);

    process.nextTick(function() {
      self.node.logApplier.persist();
    });
    callback(true);
  }

  function callback(success, reason) {
    var m = {term: self.node.currentTerm(), success: success};
    if (reason) {
      m.reason = reason;
    }
    cb(null, m);
  }

};

F.onRequestVote = function onRequestVote(args, cb) {
  // do not let false candidates disrupt the cluster
  // detect false candidates by denying vote requests
  // that come in before the minimum timeout occurs
  // after receiving a message
  var minimumTimeout = this.lastHeardFromLeader +
    this.options.minElectionTimeout;

  if (this.lastHeardFromLeader && minimumTimeout > Date.now()) {
    cb(null, {
      term: this.node.currentTerm(),
      voteGranted: false,
      reason: 'too soon'
    });
  }
  else {
    // call super
    State.prototype.onRequestVote.call(this, args, cb);
  }
};
