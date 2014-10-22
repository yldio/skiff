'use strict';

var uuid = require('cuid');

module.exports = Log;

function Log(node, options, doc) {
  if (!doc) {
    doc = {
      meta: {
        lastIncludedIndex: 0,
        lastIncludedTerm: 0
      },
      entries: []
    };
  }

  this.node = node;
  this.options = options;
  this.entries = doc.entries;
  this.lastIncludedIndex = doc.meta.lastIncludedIndex;
  this.lastIncludedTerm = doc.meta.lastIncludedTerm;
}

var L = Log.prototype;

L.push = function push() {
  var self = this;
  var entries = Array.prototype.slice.call(arguments);
  entries.forEach(processEntry);

  function processEntry(entry) {
    entry.uuid = uuid();
    entry.index = self.length() + 1;
    self.entries.push(entry);
    if (entry.topologyChange) {
      self.node.applyTopologyChange(entry.command);
    }
  }
};

L.pushEntries = function pushEntries(startIndex, entries) {
  if (entries && entries.length) {
    var self = this;
    this.entries.splice(startIndex - this.lastIncludedIndex);
    entries.forEach(function(entry) {
      self.push(entry);
    });
  }
};

L.applied = function applied(appliedIndex) {
  var toCut = appliedIndex - this.lastIncludedIndex -
              this.options.retainedLogEntries;
  if (toCut > 0) {
    var cutAt = this.entries[toCut - 1];
    this.entries.splice(0, toCut);
    this.lastIncludedIndex += toCut;
    this.lastIncludedTerm = cutAt.term;
  }
};

L.entryAt = function entryAt(index) {
  return this.entries[index - this.lastIncludedIndex - 1];
};

L.last = function last() {
  return this.entries.length ?
           this.entries[this.entries.length - 1] : undefined;
};

L.length = function length() {
  return this.lastIncludedIndex + this.entries.length;
};

L.streamline = function streamline() {
  return {
    meta: {
      lastIncludedIndex: this.lastIncludedIndex,
      lastIncludedTerm: this.lastIncludedTerm
    },
    entries: this.entries
  };
};
