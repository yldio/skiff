'use strict';

var State = require('./state');
var inherits = require('util').inherits;
var PassThrough = require('stream').PassThrough;

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
    if (!self.stopped) {
      self.node.toState('candidate');
    }
  }
}

inherits(Follower, State);

var F = Follower.prototype;

F.name = 'follower';

F.onAppendEntries = function onAppendEntries(args, cb) {
  var self = this;
  var log = this.node.commonState.persisted.log;
  var logEntry;

  this.node.startElectionTimeout();

  if (args.leaderId) {
    this.node.commonState.volatile.leaderId = args.leaderId;
  }

  if (args.prevLogIndex) {
    logEntry = log.entryAt(args.prevLogIndex);

    if (!logEntry &&
        args.prevLogIndex == log.lastIncludedIndex &&
        args.term == log.lastIncludedTerm)
    {
      logEntry = {
        term: log.lastIncludedTerm
      };
    }
  }

  if (args.term < this.node.currentTerm()) {
    callback(false, 'term is < than current term');
  }
  else if (args.prevLogIndex && !logEntry) {
    callback(false, 'local node too far behind');
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
      args.leaderCommit, self.node.commonState.persisted.log.length());

    self.node.commonState.persisted.log.pushEntries(
      args.prevLogIndex, args.entries);

    process.nextTick(function() {
      self.node.logApplier.persist();
    });
    callback(true);
  }

  function callback(success, reason) {
    var m = {
      term: self.node.currentTerm(),
      success: success,
      lastApplied: self.node.commonState.volatile.lastApplied
    };
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

F.onInstallSnapshot = function onInstallSnapshot(args, cb) {
  var self = this;
  var calledback = false;
  var lastIncludedIndex;
  var lastIncludedTerm;

  this.node.startElectionTimeout();

  if (args.term >= this.node.currentTerm()) {
    if (!this.installingSnapshot && !args.first) {
      cb(new Error('expected first snapshot chunk:' + JSON.stringify(args)));
    }
    else {
      if (args.lastIncludedIndex) {
        lastIncludedIndex = args.lastIncludedIndex;
      }
      if (args.lastIncludedTerm) {
        lastIncludedTerm = args.lastIncludedTerm;
      }
      if (args.first) {
        this.node.options.persistence.removeAllState(
          this.node.id,
          function(err) {
            if (err) {
              cb(err);
            }
            else {
              self.installingSnapshot = new PassThrough({objectMode: true});
              self.installingSnapshot.
                pipe(
                  self.node.options.persistence.createWriteStream(
                    self.node.id)).
                once('finish', onceWriteStreamFinishes);
              self.installingSnapshot.write(args.data, callback);
            }
          }
        );

      }
      else if (args.data) {
        this.installingSnapshot.write(args.data, callback);
      }
      else {
        callback();
      }

      if (args.done) {
        this.installingSnapshot.end(args.data, callback);
      }
    }
  } else {
    callback(new Error(
      'current term is ' + this.node.currentTerm() + ', not ' + args.term));
  }

  function onceWriteStreamFinishes() {
    self.installingSnapshot = false;
    var state = self.node.commonState;
    state.volatile.lastApplied = lastIncludedIndex;
    state.volatile.commmitIndex = lastIncludedIndex;
    state.persisted.log.lastIncludedIndex = lastIncludedIndex;
    state.persisted.log.lastIncludedTerm = lastIncludedTerm;
    state.persisted.log.entries = [];
  }

  function callback(err) {
    if (!calledback) {
      calledback = true;
      if (err) {
        cb(err);
      } else {
        cb(null, {term: self.node.currentTerm()});
      }
    }
  }
};
