'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Leader;

function Leader(node, options) {
  var self = this;

  State.call(this);

  this.node = node;
  this.options = options;

  this.interval = undefined;

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