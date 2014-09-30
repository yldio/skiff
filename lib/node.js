'use strict';

var Peer = require('./peer');
var extend = require('xtend');
var Cluster = require('./cluster');
var inherits = require('util').inherits;
var Broadcast = require('./broadcast');
var EventEmitter = require('events').EventEmitter;
var defaultOptions = require('./default_node_options');

var states = {
  'follower':  require('./follower'),
  'candidate': require('./candidate'),
  'leader':    require('./leader')
};

module.exports = Node;

function Node(options, cb) {
  EventEmitter.apply(this);
  if (! (this instanceof Node)) return new Node(options);
  this.options = extend({}, defaultOptions, options);
  this.id = this.options.id;
  if (! this.id) this.id = this.options.uuid();
  this.cluster = new Cluster(options);
  this.peers = [];

  this.commonState = {
    volatile: {
      commitIndex: 0,
      lastApplied: 0
    },
    persisted: {
      nodeId: this.id,
      currentTerm: 0,
      votedFor: null,
      log: []
    }
  };

  this.toState('follower');

  this.load(cb);
}

inherits(Node, EventEmitter);

var N = Node.prototype;

N.load = function load(cb) {
  var self = this;
  this.options.persistence.load(function(err, state) {
    if (err) {
      if (cb) cb(err);
      else self.emit('error', err);
    } else {
      if (state) {
        self.commonState.persisted = state;
        if (state.nodeId) self.id = state.nodeId;
      }
      if (cb) cb();
    }
  });
};

N.save = function save(cb) {
  this.options.persistence.save(this.commonState.persisted, function(err) {
    if (cb) cb(err);
  });
};

N.join = function join(peerDesc) {
  var self = this;
  var peer = peerDesc;
  if (! (peerDesc instanceof Peer)) peer = new Peer(peerDesc, this.options);
  this.peers.push(peer);

  peer.connect();

  peer.on('call', onPeerCall);

  function onPeerCall(type, args, cb) {
    var handler = peerCallHandlers[type];
    if (! handler)
      self.emit('error', new Error('unknown peer call type: ' + type));
    else handler.call(self, args, cb);
  }
};

N.toState = function toState(state) {
  var Ctor = states[state];
  if (! Ctor) throw new Error('Unknown state: ' + state);
  if (this.state) this.state.stop();
  this.state = new Ctor(this, this.options);
  this.emit('state', state);
};

N.broadcast = function broadcast(type, args) {
  return new Broadcast(this.peers, type, args);
};

N.isMajority = function isMajority(quorum) {
  var majority = Math.ceil((this.peers.length + 1) / 2); // count self
  return quorum >= majority;
};


/// Election timeout

N.startElectionTimeout = function startElectionTimeout() {
  var self = this;

  this.cancelElectionTimeout();

  this.electionTimeout = setTimeout(function() {
    self.emit('election timeout');
  }, this.randomElectionTimeout());
};

N.cancelElectionTimeout = function cancelElectionTimeout() {
  if (this.electionTimeout) clearTimeout(this.electionTimeout);
};

N.randomElectionTimeout = function randomElectionTimeout() {
  var minElectionTimeout = this.options.minElectionTimeout;
  var maxElectionTimeout = this.options.maxElectionTimeout;

  if (maxElectionTimeout < minElectionTimeout)
    throw new Error('maxElectionTimeout is greater than minElectionTimeout');

  var diff = maxElectionTimeout - minElectionTimeout;
  var d = Math.floor(Math.random() * diff);

  return minElectionTimeout + d;
};

/// Append AppendEntries

N.onAppendEntries = function onAppendEntries() {
  var fn = this.state.onAppendEntries;
  if (fn) fn.apply(this.state, arguments);
};

var peerCallHandlers = {
  'AppendEntries': N.onAppendEntries
};