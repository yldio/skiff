'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Follower;

function Follower(node, options) {
  var self = this;
  State.call(this);
}

inherits(Follower, State);

var F = Follower.prototype;

F.name = 'idle';