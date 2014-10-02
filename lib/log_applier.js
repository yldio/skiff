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

LA.maybePersist = function maybePersist() {
  if (! this.persisting &&
      this.node.commonState.volatile.commitIndex > this.node.commonState.volatile.lastApplied)
  {
    this.persist();
  }
};

LA.persist = function persist() {
  var self = this;

  var lastApplied = this.node.commonState.volatile.lastApplied + 1;
  var entry = this.node.commonState.persisted.log[lastApplied - 1];
  this.persistence.applyLog(this.node.id, lastApplied, entry, persisted);

  function persisted(err) {
    self.persisting = false;
    if (err) self.emit('error', err);
    else {
      self.node.commonState.volatile.lastApplied = lastApplied;
      self.emit('applied log', lastApplied);
      self.maybePersist();
    }
  }
};