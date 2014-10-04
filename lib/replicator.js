'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = Replicate;

function Replicate(node, peers, options) {
  var self = this;

  EventEmitter.apply(this);
  this.setMaxListeners(Infinity);

  this.node = node;
  this.peers = peers;
  this.options = options;

  this.replicate();
  this.scheduleHeartbeat();
}

inherits(Replicate, EventEmitter);

var R = Replicate.prototype;

R.scheduleHeartbeat = function scheduleHeartbeat() {
  var self = this;

  if (this.interval) clearInterval(this.interval);
  this.interval = setInterval(heartbeat, this.options.heartbeatInterval);

  function heartbeat() {
    self.replicate();
  }
};

R.stop = function cancel() {
  this.removeAllListeners();
  clearInterval(this.interval);
};

R.replicate = function replicate() {
  var self = this;

  this.scheduleHeartbeat();

  Object.keys(this.peers).forEach(function(peerId) {
    self.replicateToPeer(peerId);
  });
};

R.replicateToPeer = function replicateToPeer(peerId) {
  var self = this;
  var peer = this.peers[peerId];
  var index = peer.nextIndex;
  var log = this.node.commonState.persisted.log;
  var entries;

  if (log.length >= index) {
    entries = [log[index]];
  } else {
    entries = [];
  }

  var args = {
    term:         this.node.currentTerm(),
    leaderId:     this.node.id,
    prevLogIndex: index,
    entries:      entries,
    leaderCommit: this.node.commonState.volatile.commitIndex
  };


  peer.meta.invoke('AppendEntries', args, replied);

  function replied() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(entries.length);
    args.unshift(index);
    args.unshift(peer.meta.id);
    args.unshift('response');
    self.emit.apply(self, args);
  }
}

R.retry = function retry(peerId) {
  this.replicateToPeer(peerId);
};