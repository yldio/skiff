'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = State;

function State(node) {
  this.node = node;
  EventEmitter.call(this);
  this.stopped = false;

  this.once('stopped', function() {
    this.on('error', function() {
      // empty on purpose, we don't care about
      // state errors after stopped
    });
  });
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
    if (!self.stopped) {
      fn.apply(this, arguments);
    }
  };
};

S.onAppendEntries = function onAppendEntries(args, cb) {
  if (args.term >= this.node.currentTerm()) {
    this.node.currentTerm(args.term);
    this.node.commonState.volatile.leaderId = args.leaderId;
    this.node.toState('follower');
    this.node.onAppendEntries(args, cb);
  } else {
    cb(null, {
      term: this.node.currentTerm(),
      success: false,
      reason: 'term is behind current term'
    });
  }
};

S.onRequestVote = function(args, cb) {
  var self = this;
  var currentTerm = this.node.currentTerm();
  var state = this.node.commonState.persisted;
  if (args.term < currentTerm) {
    callback(false);
  }
  else if (!state.votedFor || state.votedFor == args.candidateId) {
    var lastLog = state.log.last();
    if (lastLog && lastLog.term < args.lastLogTerm) {
      callback(true);
    }
    else if (args.lastLogIndex >= state.log.entries.length) {
      callback(true);
    }
    else {
      callback(false);
    }
  }
  else {
    callback(false);
  }

  function callback(grant) {
    if (grant) {
      state.votedFor = args.candidateId;
      self.node.emit('vote granted', state.votedFor);
    }
    cb(null, {term: currentTerm, voteGranted: grant});
  }
};
