module.exports = LogApplier;

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

function LogApplier(log, node, persistence) {
  EventEmitter.call(this);

  this.log = log;
  this.node = node;
  this.persistence = persistence;

  this.persisting = false;

  this.maybePersist();
}

inherits(LogApplier, EventEmitter);

var LA = LogApplier.prototype;

LA.maybePersist = function maybePersist(cb) {
  if (! this.persisting &&
      this.node.commonState.volatile.commitIndex > this.node.commonState.volatile.lastApplied)
  {
    this.persist(cb);
  } else setImmediate(cb);
};

LA.persist = function persist(cb) {
  var self = this;

  if (self.node.commonState.volatile.commitIndex > self.node.commonState.volatile.lastApplied) {
    var lastApplied = self.node.commonState.volatile.lastApplied + 1;
    var entry = self.node.commonState.persisted.log[lastApplied - 1];
    self.persistence.applyLog(self.node.id, lastApplied, entry, persisted);

    function persisted(err) {
      self.persisting = false;
      if (err) self.emit('error', err);
      else {
        self.node.commonState.volatile.lastApplied = lastApplied;
        self.emit('applied log', lastApplied);
        self.maybePersist(cb);
      }
    }
  } else if (cb) setImmediate(cb);
};