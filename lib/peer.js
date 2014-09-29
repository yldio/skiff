module.exports = Peer;

function Peer(options) {
  if (! (this instanceof Peer)) return new Peer(options);
  this.options = options;
}