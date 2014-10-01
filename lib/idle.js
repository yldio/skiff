'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Follower;

function Follower() {
  State.call(this);
}

inherits(Follower, State);

var F = Follower.prototype;

F.name = 'idle';