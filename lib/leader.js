'use strict';

var State = require('./state');
var inherits = require('util').inherits;

module.exports = Leader;

function Leader(node, options) {
  State.call(this);

  this.node = node;
  this.options = options;
}

inherits(Leader, State);

var L = Leader.prototype;

L.name = 'leader';