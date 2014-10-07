'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Standby;

function Standby(node) {
  State.call(this, node);
}

inherits(Standby, State);

var S = Standby.prototype;

S.name = 'standby';
