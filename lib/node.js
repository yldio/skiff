'use strict';

var Peer = require('./peer');
var extend = require('xtend');
var Cluster = require('./cluster');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var defaultOptions = require('./default_node_options');

var states = {
  'follower': require('./follower'),
  'candidate': require('./candidate')
};

module.exports = Node;

function Node(options) {
  if (! (this instanceof Node)) return new Node(options);
  this.options = extend({}, defaultOptions, options);
  this.cluster = new Cluster(options);
  this.peers = [];

  this.common = {
    commitIndex: 0,
    lastApplied: 0
  };

  this.toState('follower');
}

inherits(Node, EventEmitter);

var N = Node.prototype;

N.join = function join(peerDesc) {
  var peer = peerDesc;
  if (! (peerDesc instanceof Peer)) peer = new Peer(peerDesc, this.options);
  this.peers.push(peer);

  peer.connect();
};

N.toState = function toState(state) {
  var Ctor = states[state];
  if (! Ctor) throw new Error('Unknown state: ' + state);
  this.state = new Ctor(this, this.options);
};