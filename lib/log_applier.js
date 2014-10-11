'use strict';

module.exports = LogApplier;

var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;

function LogApplier(log, node, persistence) {
  EventEmitter.call(this);
  this.log = log;
  this.node = node;
  this.persistence = persistence;
  this.persisting = false;
  this.persist();
}

inherits(LogApplier, EventEmitter);

var LA = LogApplier.prototype;

LA.persist = function persist(cb) {
  var self = this;
  var state = self.node.commonState.volatile;
  var toApply = state.lastApplied + 1;

  if (!this.persisting) {
    this.persisting = true;
    if (state.commitIndex > state.lastApplied) {
      var entry = self.node.commonState.persisted.log.entries[toApply - 1];
      if (!entry) {
        done();
      }
      else if (entry.topologyChange) {
        // this is an internal command, a topology command
        // that was already processed (topology commands are processed
        // once they are inserted into the log):
        // we do not need send it to the persistence layer.
        self.persistence.saveCommitIndex(self.node.id, toApply, function(err) {
          if (err) {
            done(err);
          }
          else {
            self.node.save(persisted);
          }
        });
      }
      else {
        self.persistence.applyLog(self.node.id, toApply, entry, persisted);
      }
    } else {
      this.persisting = false;
      self.emit('done persisting');
      done();
    }
  }
  else if (cb) {
    self.once('done persisting', cb);
  }

  function done(err) {
    self.persisting = false;
    if (err) {
      if (cb) {
        cb(err);
      } else {
        self.emit('error', err);
      }
    }
    else {
      if (cb) {
        cb();
      }
    }
  }

  function persisted(err) {
    if (err) {
      done(err);
    }
    else {
      self.persisting = false;
      state.lastApplied = toApply;
      self.emit('applied log', toApply);
      self.persist(cb);
    }
  }
};
