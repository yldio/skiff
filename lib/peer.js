'use strict';

module.exports = Peer;

function Peer(peerOptions, options) {
  if (! (this instanceof Peer)) return new Peer(peerOptions, options);
  this.options = peerOptions;
  this.transport = options.transport;
  if (! options.transport) throw new Error('No transport defined');
}

var P = Peer.prototype;

P.connect = function connect() {
  this.connection = this.transport.connect(this.options);
  return this.connection;
};

P.invoke = function invoke(type, args, cb) {
  if (! this.connection) {
    cb(new Error('not connected'));
  } else {
    this.connection.invoke(type, args, cb);
  }
};