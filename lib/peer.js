'use strict';

var async = require('async');
var assert = require('assert');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = Peer;

function Peer(id, options, connection) {
  var self = this;

  if (!(this instanceof Peer)) {
    return new Peer(id, options);
  }

  EventEmitter.call(this);

  assert.ok(typeof id === 'string', 'peer id must be string');
  assert.ok(options.transport, 'No transport defined');

  this.id = id;
  this.transport = options.transport;
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

/// leaving

P.willLeave = function() {
  this.leaving = true;
};
