'use strict';

var State = require('./state');
var inherits = require('util').inherits;
var Replicator = require('./replicator');

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

  this.replicator = new Replicator(node, this.peers, options);
  this.replicator.on('error', function(err) {
    self.emit('error', err);
  });
  this.once('stopped',  function stopped() {
    self.replicator.stop();
  });
  this.replicator.on('response', onReplicateResponse);

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
      self.emit('replication success', peerId, logIndex);
    }
    else if (self.peers[peerId].nextIndex > 1) {
      self.peers[peerId].nextIndex = Math.max(self.peers[peerId].nextIndex - 1, 1);
      self.replicator.retry(peerId);
    }
  }
}

inherits(Leader, State);

var L = Leader.prototype;

L.name = 'leader';

L.replicate = function replicate(logIndex, cb) {
  var self = this;


  var yep = 1; // count self
  var nope = 0;
  var replied = false;

  this.on('replication success', onReplicationSuccess);

  function onReplicationSuccess(peerId, peerLogIndex) {
    if (peerLogIndex == logIndex) {
      yep ++;
      if (! replied && self.node.isMajority(yep)) {
        replied = true;
        self.removeListener('replication success', onReplicationSuccess);
        cb();
      }
    }
  }

};
