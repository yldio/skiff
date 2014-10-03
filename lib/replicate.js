'use strict';

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = Replicate;

function Replicate(leader, term, log, peers) {
  var self = this;

  EventEmitter.apply(this);

  this.leader = leader;
  this.term = term;
  this.log = log;
  this.peers = peers;

  Object.keys(peers).forEach(replicate);

  function replicate(peer) {
    self.replicate(peer);
  }

}

inherits(Replicate, EventEmitter);

var R = Replicate.prototype;

R.cancel = function cancel() {
  this.removeAllListeners();
};

R.replicate = function replicate(peerId) {
  var self = this;
  var peer = this.peers[peerId];
  var nextIndex = peer.nextIndex - 2;
  var entry;
  var entries;

  if (nextIndex < 0) nextIndex = undefined;

  if (nextIndex != undefined) entry = this.log[nextIndex];
  if (entry) entries = [entry];

  var args = {
    term:         this.term,
    leaderId:     this.leader,
    prevLogIndex: nextIndex,
    entries:      entries
  };
  peer.meta.invoke('AppendEntries', args, replied);

  function replied() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(nextIndex);
    args.unshift(peer.meta.id);
    args.unshift('response');
    self.emit.apply(self, args);
  }
}

R.retry = function retry(peerId) {
  this.replicate(peerId);
};