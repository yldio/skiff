'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Stopped;

function Stopped(node) {
  State.call(this, node);
}

inherits(Stopped, State);

var S = Stopped.prototype;

S.name = 'stopped';

S.onAppendEntries = function onAppendEntries(args, cb) {
  cb(null, {
    term: this.node.currentTerm(),
    success: false,
    lastApplied: this.node.commonState.volatile.lastApplied,
    reason: 'stopped'
  });
};

S.onRequestVote = function onRequestVote(args, cb) {
  cb(null, {
    term: this.node.currentTerm(),
    voteGranted: false,
    reason: 'stopped'
  });
};

S.onInstallSnapshot = function onInstallSnapshot(args, cb) {
  cb(new Error('stopped'));
};
