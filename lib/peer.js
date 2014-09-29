'use strict';

var async = require('async');

module.exports = Peer;

function Peer(peerOptions, options) {
  var self = this;

  if (! (this instanceof Peer)) return new Peer(peerOptions, options);
  this.options = peerOptions;
  this.transport = options.transport;
  if (! options.transport) throw new Error('No transport defined');

  this.queues = {
    out: async.queue(invoke, 1)
  };

  function invoke(work, done) {
    _invoke.call(self, work.type, work.args, callback);

    function callback() {
      work.cb.apply(null, arguments);
      done();
    }
  }
}

var P = Peer.prototype;

P.connect = function connect() {
  this.connection = this.transport.connect(this.options);
  return this.connection;
};

function _invoke(type, args, cb) {
  if (! this.connection) {
    cb(new Error('not connected'));
  } else {
    this.connection.invoke(type, args, cb);
  }

}

P.invoke = function invoke(type, args, cb) {
  this.queues.out.push({
    type: type,
    args: args,
    cb: cb
  });
};