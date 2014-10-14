'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var PassThrough = require('stream').PassThrough;

module.exports = State;

function State(node) {
  this.node = node;
  EventEmitter.call(this);
  this.stopped = false;
  this.installingSnapshot = false;

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

S.onRequestVote = function onRequestVote(args, cb) {
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
    else if (args.lastLogIndex >= state.log.length()) {
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

S.onInstallSnapshot = function onInstallSnapshot(args, cb) {
  var self = this;
  var calledback = false;

  if (args.term >= this.node.currentTerm()) {
    if (!this.installingSnapshot && !args.first) {
      cb(new Error('expected first snapshot chunk:' + JSON.stringify(args)));
    }
    else {
      if (args.first) {
        this.installingSnapshot = new PassThrough({objectMode: true});
        this.installingSnapshot.
          pipe(this.node.options.persistence.createWriteStream(this.node.id)).
          once('finish', onceWriteStreamFinishes);
      }
      if (args.data) {
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
    callback(new Error('current term is ' + this.node.currentTerm()));
  }

  function onceWriteStreamFinishes() {
    self.installingSnapshot = false;
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
