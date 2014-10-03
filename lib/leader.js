'use strict';

var State = require('./state');
var inherits = require('util').inherits;
var Replicate = require('./replicate');

module.exports = Leader;

function Leader(node, options) {
  var self = this;

  State.call(this);

  this.node = node;
  this.options = options;

  this.interval = undefined;
  this.peers = {};

  node.peers.forEach(function(peer) {
    self.peers[peer.id] = {
      meta: peer,
      nextIndex: node.commonState.persisted.log.length + 2,
      matchIndex: 0
    };
  });

  this.heartbeat();
  this.scheduleHeartbeat();
  this.once('stopped',  function stopped() {
    self.unscheduleHeartbeat();
  });
}

inherits(Leader, State);

var L = Leader.prototype;

L.name = 'leader';

L.heartbeat = function heartbeat() {
  var heartbeat = {
    term:         this.node.currentTerm(),
    leaderId:     this.node.id,
    entries:      [],
    leaderCommit: this.node.commonState.volatile.lastApplied
  };

  var broadcast = this.node.broadcast('AppendEntries', heartbeat);
};

L.scheduleHeartbeat = function scheduleHeartbeat() {
  var self = this;

  this.unscheduleHeartbeat;
  this.interval = setInterval(heartbeat, this.options.heartbeatInterval);

  function heartbeat() {
    self.heartbeat();
  }
};

L.unscheduleHeartbeat = function unscheduleHeartbeat() {
  if (this.interval) clearInterval(this.interval);
};

L.replicate = function replicate(cb) {
  var self = this;

  var replicate = new Replicate(
    this.node.id, this.node.currentTerm(), this.node.commonState.persisted.log, this.peers);

  replicate.on('response', onReplicateResponse);

  replicate.on('error', function(err) {
    self.emit('error', err);
  });

  var yep = 1; // count self
  var nope = 0;
  var replied = false;

  function onReplicateResponse(peerId, logIndex, err, args) {
    if (err) self.emit('err');
    else if (args.term > self.node.currentTerm()) {
      self.node.currentTerm(args.term);
      self.node.save(function(err) {
        if (err) self.emit('error', err);
        self.node.toState('follower');
      });
    }
    else if (args.success) {
      self.peers[peerId].nextIndex = logIndex + 1;
      yep ++;
      if (! replied && self.node.isMajority(yep)) {
        replied = true;
        cb();
      }
    }
    else if (self.peers[peerId].nextIndex > 1) {
      self.peers[peerId].nextIndex = Math.max(self.peers[peerId].nextIndex - 1, 1);
      replicate.retry(peerId);
    } else {
      nope ++;
      if (! replied && self.node.isMajority(nope)) {
        replied = true;
        cb(new Error('Too many peer errors'));
      }
    }
  }
};
