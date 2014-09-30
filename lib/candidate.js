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
    saveState,
    requestVotes,
    waitForMajority,
    becomeLeader
    ], done);

  function startTimeout(cb) {
    self.node.startElectionTimeout();
    self.node.once('election timeout', self.unlessStopped(onElectionTimeout));
    cb();
  }

  function onElectionTimeout() {
    self.node.toState('candidate');
  }

  function incrementTerm(cb) {
    self.node.commonState.persisted.currentTerm += 1;
    cb();
  }

  function saveState(cb) {
    if (! self.stopped) self.node.save(cb);
  }

  function requestVotes(cb) {
    var lastLog;

    if (! self.stopped) {
      if (self.node.commonState.persisted.log.length)
        lastLog = self.node.commonState.
                  persisted.log[self.node.commonState.log.length - 1];

      var args = {
        term:         self.node.commonState.persisted.currentTerm,
        candidateId:  self.node.id,
        lastLogIndex: self.node.commonState.persisted.log.length + 1,
        lastLogTerm:  lastLog && lastLog.term
      };

      var broadcast = self.node.broadcast('RequestVote', args);
      cb(null, broadcast);
    }
  }

  function waitForMajority(broadcast, cb) {
    broadcast.on('response', self.unlessStopped(onBroadcastResponse));
    verifyMajority();

    function onBroadcastResponse(term, voteGranted) {
      // TODO: what about the term update?
      if (voteGranted) {
        votedForMe ++;
        verifyMajority();
      }
    }

    function verifyMajority() {
      if (self.node.isMajority(votedForMe)) {
        broadcast.cancel();
        self.node.cancelElectionTimeout();
        cb();
      }
    }
  }

  function becomeLeader(cb) {
    self.node.toState('leader');
    cb();
  }

  function done(err) {
    if (err) self.node.emit('error', err);
  }


};

C.onAppendEntries = function onAppendEntries(args, cb) {
  var self = this;

  if (args.term > this.node.commonState.persisted.currentTerm) {
    this.node.commonState.persisted.currentTerm = args.term;
    this.node.save(saved);
  }
  else cb();

  function saved(err) {
    if (err) self.node.emit('error', err);
    self.node.toState('follower');
    cb();
  }
};