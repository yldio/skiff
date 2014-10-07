'use strict';

var async = require('async');
var State = require('./state');
var inherits = require('util').inherits;

module.exports = Candidate;

function Candidate(node, options) {
  State.call(this);
  this.node = node;
  this.options = options;

  this._startVoting();
}

inherits(Candidate, State);

var C = Candidate.prototype;

C.name = 'candidate';

C._startVoting = function _startVoting() {
  var self = this;

  var votedForMe = 1;

  async.waterfall([
    startTimeout,
    incrementTerm,
    requestVotes
  ]);

  function startTimeout(cb) {
    self.node.startElectionTimeout();
    self.once('election timeout', onElectionTimeout);
    cb();
  }

  function onElectionTimeout() {
    self.node.toState('candidate');
  }

  function incrementTerm(cb) {
    self.node.commonState.persisted.currentTerm += 1;
    cb();
  }

  function requestVotes(cb) {
    var lastLog;
    var broadcast;

    verifyMajority();
    if (!self.stopped) {
      if (self.node.commonState.persisted.log.length) {
        lastLog = self.node.commonState.
          persisted.log[self.node.commonState.persisted.log.length - 1];
      }

      var args = {
        term:         self.node.commonState.persisted.currentTerm,
        candidateId:  self.node.id,
        lastLogIndex: self.node.commonState.persisted.log.length,
        lastLogTerm:  lastLog && lastLog.term
      };

      broadcast = self.node.broadcast('RequestVote', args);
      broadcast.on('response', self.unlessStopped(onBroadcastResponse));
    }

    function onBroadcastResponse(err, args) {
      // TODO: what about the term update?
      if (args && args.voteGranted) {
        votedForMe ++;
        verifyMajority();
      }
    }

    function verifyMajority() {
      if (self.node.isMajority(votedForMe)) {
        if (broadcast) {
          broadcast.cancel();
        }
        self.node.cancelElectionTimeout();
        self.node.toState('leader');
        cb();
      }
    }
  }

};

C.onAppendEntries = function onAppendEntries(args, cb) {
  var self = this;

  if (args.term > this.node.commonState.persisted.currentTerm) {
    this.node.commonState.persisted.currentTerm = args.term;
    self.node.toState('follower');
    self.node.state.onAppendEntries(args, cb);
  }
  else {
    cb(null, {term: this.node.currentTerm(), success: false});
  }
};
