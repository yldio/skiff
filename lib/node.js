'use strict';

var Log = require('./log');
var Peer = require('./peer');
var async = require('async');
var extend = require('xtend');
var assert = require('assert');
var Cluster = require('./cluster');
var inherits = require('util').inherits;
var Broadcast = require('./broadcast');
var LogApplier = require('./log_applier');
var EventEmitter = require('events').EventEmitter;
var defaultOptions = require('./default_node_options');

var states = {
  'standby':   require('./standby'),
  'idle':      require('./idle'),
  'stopped':   require('./stopped'),
  'follower':  require('./follower'),
  'candidate': require('./candidate'),
  'leader':    require('./leader')
};

module.exports = Node;

function Node(options) {
  if (!(this instanceof Node)) {
    return new Node(options);
  }

  var self = this;

  EventEmitter.apply(this);
  this.setMaxListeners(Infinity);

  this.options = extend({}, defaultOptions, options);
  this.id = this.options.id;
  if (!this.id) {
    this.id = this.options.uuid();
  }

  assert(this.options.transport, 'need options.transport');

  this.cluster = new Cluster(options);
  this.loaded = false;
  this.stopped = false;

  this.commonState = {
    volatile: {
      leaderId: null,
      commitIndex: 0,
      lastApplied: 0
    },
    persisted: {
      currentTerm: 0,
      votedFor: null,
      log: new Log(self, this.options),
      peers: []
    }
  };

  this.logApplier = new LogApplier(
    this.commonState.persisted.log, this, this.options.persistence);
  this.logApplier.on('error', function(err) {
    self.emit('error', err);
  });
  this.logApplier.on('applied log', function(logIndex) {
    self.emit('applied log', logIndex);
  });
  this.logApplier.on('done persisting', function(lastApplied) {
    self.commonState.persisted.log.applied(
      self.commonState.volatile.lastApplied);
    self.emit('done persisting', lastApplied);
  });

  this.on('election timeout', function() {
    this.state.emit('election timeout');
  });

  this.on('joined', function(peer) {
    this.state.emit('joined', peer);
  });

  this.toState('idle');

  this.load(loaded);

  function loaded(err) {
    if (err) {
      process.nextTick(function() {
        self.emit('error', err);
      });
    } else {
      self.loaded = true;
      self.emit('loaded');
      self.toState(self.options.standby ? 'standby' : 'follower');
    }
  }
}

inherits(Node, EventEmitter);

var N = Node.prototype;

/// persistent node state

N.load = function load(cb) {
  var self = this;

  async.parallel([
    loadMeta,
    loadCommitIndex
  ], done);

  function loadMeta(cb) {
    self.options.persistence.loadMeta(self.id, cb);
  }

  function loadCommitIndex(cb) {
    self.options.persistence.lastAppliedCommitIndex(self.id, cb);
  }

  function done(err, results) {
    var state = self.commonState;
    if (!err && results) {
      if (results[0]) {
        state.persisted = results[0];
        state.persisted.peers = state.persisted.peers.map(newPeer);
        state.persisted.log = new Log(self, self.options, state.persisted.log);
      }

      if (results[1]) {
        self.commonState.volatile.lastApplied = results[1];
      }
    }
    cb(err);
  }

  function newPeer(peerDesc) {
    var peer = new Peer(peerDesc, self.options, null, self);
    self._join(peer);

    return peer;
  }
};

N.save = function save(cb) {
  var state = extend({}, this.commonState.persisted, {
    log: this.commonState.persisted.log.streamline(),
    peers: this.commonState.persisted.peers.map(function(peer) {
      return peer.id;
    })
  });
  this.options.persistence.saveMeta(this.id, state, cb);
};

N.onceLoaded = function onceLoaded(cb) {
  if (this.loaded) {
    cb();
  }
  else {
    this.once('loaded', cb);
  }
};

///  Listen

N.listen = function listen(options, cb) {
  var self = this;

  if (this.server) {
    this.server.close();
  }
  this.server = this.options.transport.listen(this.id, options, listener, cb);

  function listener(peerId, connection) {
    self._join(peerId, connection);
  }
};

/// Peers

N.join = function join(peerDesc, cb) {
  var self = this;

  if (peerDesc == this.id) {
    done(new Error('can\'t join self'));
  }
  else {
    async.series([ensureLeader, pushAddPeerCommand], done);
  }

  function ensureLeader(cb) {
    self.ensureLeader(cb);
  }

  function pushAddPeerCommand(cb) {
    var cmd = ['add peer', peerDesc];
    self.command(cmd, cb, true);
  }

  function done(err) {
    if (err && !cb) {
      self.emit('error', err);
    }
    else if (cb) {
      cb(err);
    }
  }
};

N.leave = function leave(peerDesc, cb) {
  var self = this;

  async.series(
    [
      ensureLeader,
      pushRemovePeerCommand,
      maybeStopSelf
    ], cb);

  function ensureLeader(cb) {
    self.ensureLeader(cb);
  }

  function pushRemovePeerCommand(cb) {
    var cmd = ['remove peer', peerDesc];
    self.command(cmd, cb, true);
  }

  function maybeStopSelf(cb) {
    if (peerDesc == self.id) {
      self.toState('stopped');
      setTimeout(function() {
        self.stop();
      }, 1e3);
    }
    cb();
  }
};

N._join = function _join(peerDesc, connection) {
  var self = this;

  if (peerDesc != this.id) {
    var peer;
    var found;

    for (var i = 0 ; i < this.commonState.persisted.peers.length ; i ++) {
      peer = this.commonState.persisted.peers[i];
      if (peer.id == peerDesc) {
        found = peer;
        break;
      }
    }
    if (found) {
      peer.disconnect();
      peer.removeAllListeners();
    }
    // peer is not on our list, let's add it
    peer = peerDesc;
    if (!(peerDesc instanceof Peer)) {
      peer = new Peer(peerDesc, this.options, connection, self);
    }
    if (!found) {
      this.commonState.persisted.peers.push(peer);
    }

    if (!connection) {
      peer.connect();
    }

    peer.on('call', onPeerCall);
    peer.once('connection closed', function() {
      peer.removeListener('call', onPeerCall);
    });
    peer.on('outgoing call', onPeerOutgoingCall);
    peer.on('response', onPeerResponse);
    peer.once('connected', onPeerConnected);
    peer.once('close', onPeerClose);
    peer.on('connected', onPeerConnected);
    peer.on('disconnected', onPeerDisconnected);

    if (!found) {
      self.emit('joined', peer);
    }
  }

  function onPeerCall(type, args, cb) {
    self.handlePeerCall(peer, type, args, cb);
  }

  function onPeerOutgoingCall(type, args) {
    self.emit('outgoing call', peer, type, args);
  }

  function onPeerResponse(err, args) {
    self.emit('response', peer, err, args);
  }

  function onPeerConnected() {
    self.emit('connected', peer);
  }

  function onPeerClose() {
    self.emit('close', peer);
  }

  function onPeerDisconnected() {
    self.emit('disconnected', peer);
  }
};

N._leave = function _leave(peerDesc) {
  var peers = this.commonState.persisted.peers;
  var peer;
  var peerIndex;

  for (peerIndex = 0 ; peerIndex < peers.length ; peerIndex ++) {
    peer = peers[peerIndex];
    if (peer.id == peerDesc) {
      break;
    }
  }
  if (peer) {
    this.commonState.persisted.peers.splice(peerIndex, 1);
    peer.disconnect();
    peer.removeAllListeners();
    this.state.emit('left', peer);
    this.emit('left', peer);
  }
};

/// state transition

N.toState = function toState(state) {
  var self = this;
  var previousState = self.state;

  this.cancelElectionTimeout();

  var Ctor = states[state];
  if (!Ctor) {
    throw new Error('Unknown state: ' + state);
  }

  if (previousState) {
    previousState.stop();
  }
  self.state = new Ctor(self, self.options);
  self.state.on('error', function(err) {
    self.emit('error', err);
  });
  self.emit('state', state, self);
  self.emit(state, self);
};

/// broadcast

N.broadcast = function broadcast(type, args) {
  return new Broadcast(this, this.commonState.persisted.peers, type, args);
};

/// majority

N.isMajority = function isMajority(quorum) {
  var majority = Math.ceil((this.commonState.persisted.peers.length + 1) / 2);
  return quorum >= majority;
};

/// term

N.currentTerm = function currentTerm(term) {
  if (!term) {
    term = this.commonState.persisted.currentTerm;
  }
  else {
    this.commonState.persisted.currentTerm = term;
  }

  return term;
};

N.startElectionTimeout = function startElectionTimeout() {
  this.emit('reset election timeout');
  var self = this;

  if (this.electionTimeout) {
    clearTimeout(this.electionTimeout);
  }

  this.electionTimeout = setTimeout(function() {
    self.emit('election timeout');
  }, this.randomElectionTimeout());
};

N.cancelElectionTimeout = function cancelElectionTimeout() {
  if (this.electionTimeout) {
    clearTimeout(this.electionTimeout);
    this.electionTimeout = null;
  }
};

N.randomElectionTimeout = function randomElectionTimeout() {
  var minElectionTimeout = this.options.minElectionTimeout;
  var maxElectionTimeout = this.options.maxElectionTimeout;

  if (maxElectionTimeout < minElectionTimeout) {
    this.emit('error',
      new Error('maxElectionTimeout is greater than minElectionTimeout'));
  }

  var diff = maxElectionTimeout - minElectionTimeout;
  var d = Math.floor(Math.random() * diff);

  var timeout = minElectionTimeout + d;

  return timeout;
};

/// Client API

N.ensureLeader = function ensureLeader(cb) {
  var err;

  if (this.state.name != 'leader') {
    err = new Error('not the leader');
    err.code = 'ENOTLEADER';
    err.leader = this.commonState.volatile.leader;
  }
  cb(err);
};

N.command = function command(cmd, options, cb, isTopologyChange) {
  var self = this;
  var commitIndex;

  if (typeof options == 'function') {
    isTopologyChange = cb;
    cb = options;
    options = undefined;
  }

  if (!options) {
    options = {
      timeout: this.options.commandTimeout
    };
  }

  async.series([
    ensureLoaded,
    ensureLeader,
    pushLogEntry,
    replicate,
    applyLogs,
    persist
  ], cb);

  function ensureLoaded(cb) {
    self.onceLoaded(cb);
  }

  function ensureLeader(cb) {
    self.ensureLeader(cb);
  }

  function pushLogEntry(cb) {
    var entry = {
      term: self.currentTerm(),
      command: cmd
    };
    if (isTopologyChange) {
      entry.topologyChange = true;
    }
    self.commonState.persisted.log.push(entry);
    cb();
  }

  function replicate(cb) {
    commitIndex = self.commonState.persisted.log.length();
    self.state.replicate(commitIndex, options.timeout, cb);
  }

  function applyLogs(cb) {
    self.commonState.volatile.commitIndex = commitIndex;
    self.logApplier.persist(cb);
  }

  function persist(cb) {
    self.save(cb);
  }
};

/// handle peer calls

N.handlePeerCall = function handlePeerCall(peer, type, args, cb) {
  var self = this;

  if (!this.stopped) {
    this.onceLoaded(function() {
      var handler = peerCallHandlers[type];
      if (!handler) {
        self.emit('error', new Error('unknown peer call type: ' + type));
      }
      else {
        handler.call(self, args, handlerReplied);
      }
    });
  }

  function handlerReplied() {
    var args = arguments;
    self.emit('reply', args);
    self.save(function(err) {
      if (err) {
        self.emit('error', err);
      }
      else {
        cb.apply(null, args);
      }
    });
  }
};

/// peer call handlers

var peerCallHandlers = {};
['AppendEntries', 'RequestVote', 'InstallSnapshot'].forEach(installRpcHandler);

function installRpcHandler(type) {
  var methodName = 'on' + type;
  N[methodName] = peerCallHandlers[type] = handler;

  function handler(args, cb) {
    /* jshint validthis: true */
    this.emit(type, args);
    this.state[methodName](args, cb);
  }
}

/// Topology changes

var topologyChangeCommands = {
  'add peer': N._join,
  'remove peer': N._leave
};

N.applyTopologyChange = function applyTopologyChange(entry) {
  var fn = topologyChangeCommands[entry[0]];
  if (fn) {
    fn.call(this, entry[1]);
  }
};

/// stop

N.stop = function stop(cb) {
  if (!this.stopped) {
    this.stopped = true;
    this.toState('stopped');

    if (this.server) {
      this.server.close(cb);
    } else {
      setImmediate(cb);
    }

    this.commonState.persisted.peers.forEach(disconnectPeer);

  } else if (cb) {
    setImmediate(cb);
  }

  function disconnectPeer(peer) {
    peer.disconnect();
  }
};

N.close = N.stop;
