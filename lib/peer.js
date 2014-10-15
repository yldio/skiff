'use strict';

var async = require('async');
var assert = require('assert');
var inherits = require('util').inherits;
var Writable = require('stream').Writable;
var EventEmitter = require('events').EventEmitter;

module.exports = Peer;

function Peer(id, options, connection, node) {
  var self = this;

  if (!(this instanceof Peer)) {
    return new Peer(id, options);
  }

  EventEmitter.call(this);

  assert.ok(typeof id === 'string', 'peer id must be string');
  assert.ok(options.transport, 'No transport defined');

  this.id = id;
  this.options = options;
  this.transport = options.transport;
  this.node = node;
  this.leaving = false;

  this.queues = {
    out: async.queue(invoke, 1),
    in: async.queue(receive, 1)
  };

  if (connection) {
    this.setupConnection(connection);
  }

  function invoke(work, done) {
    var calledback = false;
    self._invoke.call(self, work.type, work.args, callback);

    function callback() {
      if (!calledback) {
        calledback = true;
        work.cb.apply(null, arguments);
        done();
      }
    }
  }

  function receive(message, cb) {
    self.emit('call', message.type, message.args, callback);

    function callback() {
      message.cb.apply(null, arguments);
      cb();
    }
  }
}

inherits(Peer, EventEmitter);

var P = Peer.prototype;

P.connect = function connect() {
  var connection = this.transport.connect(this.id);
  this.setupConnection(connection);
  return connection;
};

P.setupConnection = function setupConnection(connection) {
  var self = this;

  this.connection = connection;
  this.connection.receive(onMessage);
  this.connection.once('close', onConnectionClose);

  this.emit('connected');

  function onMessage(type, args, cb) {
    self.queues.in.push({
      type: type,
      args: args,
      cb: cb
    });
  }

  function onConnectionClose() {
    self.emit('close');
  }
};

P.disconnect = function disconnect() {
  var self = this;

  this.connection.close(closed);

  function closed(err) {
    if (err) {
      self.emit('error', err);
    }
    else {
      self.emit('connection closed');
    }
  }
};

P._invoke = function _invoke(type, args, cb) {
  var self = this;

  this.emit('outgoing call', type, args);
  if (!this.connection) {
    cb(new Error('not connected'));
  }
  else {
    this.connection.send(type, args, callback);
  }

  function callback(err, args) {
    self.emit('response', err, args);
    cb.apply(null, arguments);
  }
};

P.send = function invoke(type, args, cb) {
  this.queues.out.push({
    type: type,
    args: args,
    cb: cb
  });
};

/// toJSON

P.toJSON = function toJSON() {
  return this.id;
};

/// createWriteStream

P.createWriteStream = function createWriteStream() {
  var self = this;
  var first = true;
  var error;
  var lastIncludedIndex = self.node.commonState.volatile.lastApplied;
  var lastIncludedTerm = self.node.currentTerm();

  var stream = new Writable({
    objectMode: true,
    highWaterMark: this.options.replicationStreamHighWaterMark
  });

  stream.on('error', function(err) {
    error = err;
    self.emit('error', err);
  });

  stream._write = function(chunk, _, callback) {
    self.send('InstallSnapshot', {
      term: self.node.currentTerm(),
      leaderId: self.node.id,
      data: chunk,
      first: first,
      done: false,
      lastIncludedIndex: lastIncludedIndex,
      lastIncludedTerm: lastIncludedTerm
    }, callback);

    first = false;
  };

  stream.once('finish', function() {
    if (!error) {
      self.send('InstallSnapshot', {
        term: self.node.currentTerm(),
        leaderId: self.node.id,
        data: null,
        first: first,
        done: true,
        lastIncludedIndex: lastIncludedIndex,
        lastIncludedTerm: lastIncludedTerm
      }, onReply);

      first = false;
    }
  });

  return stream;

  function onReply(err) {
    if (err) {
      stream.emit('error', err);
    }
  }
};
