'use strict';

module.exports = Follower;

function Follower(node, options) {
  this.node = node;
  this.options = options;
  this._startElectionTimeout();
};

var F = Follower.prototype;

F.name = 'follower';

F._startElectionTimeout = function _startElectionTimeout() {
  var self = this;

  this.electionTimeout = setTimeout(function() {
    self.node.toState('candidate');
    self.node.emit('election timeout');
  }, this._electionTimeout());
};

F._electionTimeout = function _electionTimeout() {
  var minElectionTimeout = this.options.minElectionTimeout;
  var maxElectionTimeout = this.options.maxElectionTimeout;

  if (maxElectionTimeout < minElectionTimeout)
    throw new Error('maxElectionTimeout is greater than minElectionTimeout');

  var diff = maxElectionTimeout - minElectionTimeout;
  var d = Math.floor(Math.random() * diff);

  return minElectionTimeout + d;
}