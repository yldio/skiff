'use strict';

var async = require('async');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

module.exports = Peer;

function Peer(peerOptions, options) {
  EventEmitter.call(this);

  var self = this;

  if (! (this instanceof Peer)) return new Peer(peerOptions, options);
  this.options = peerOptions;
  this.transport = options.transport;
  if (! options.transport) throw new Error('No transport defined');

  this.queues = {
    out: async.queue(invoke, 1),
    in: async.queue(receive, 1)
  };

  function invoke(work, done) {
    var calledback = false;
    self._invoke.call(self, work.type, work.args, callback);

    function callback() {
      if (! calledback) {
        calledback = true;
        work.cb.apply(null, arguments);
        done();
      }
    }
  }

  function receive(m) {
    self.emit('call', m.type, m.args, m.cb);
  }
}

inherits(Peer, EventEmitter);

var P = Peer.prototype;

P.connect = function connect() {
  var self = this;

  this.connection = this.transport.connect(this.options);
  this.connection.listen(onMessage);
  return this.connection;

  function onMessage(type, args, cb) {
    self.queues.in.push({
      type: type,
      args: args,
      cb: cb
    });
  }
};

P._invoke = function _invoke(type, args, cb) {
  if (! this.connection) cb(new Error('not connected'));
  else this.connection.invoke(type, args, cb);
};

P.invoke = function invoke(type, args, cb) {
  this.queues.out.push({
    type: type,
    args: args,
    cb: cb
  });
};