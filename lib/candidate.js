'use strict';

module.exports = Candidate;

function Candidate(node, options) {
  this.node = node;
  this.options = options;

  // this._startVoting();
};

var C = Candidate.prototype;

C.name = 'candidate';
