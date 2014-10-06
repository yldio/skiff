'use strict';

var inherits = require('util').inherits;

module.exports = Log;

function Log(node) {
  this.node = node;
  this.entries = [];
  this.length = 0;
}

inherits(Log, Array);

var L = Log.prototype;

L.push = function push() {
  var self = this;
  var entries = Array.prorotype.slice.call(arguments);
  entries.forEach(processEntry);
  this.length = this.entries.length;

  function processEntry(entry) {
    self.entries.push(entry);
    if (entry.topologyChange) self.node.applyTopologyChange(entry.command);
  }
};

L.applyEntries = function applyEntries(startIndex, entries) {
  var self = this;
  this.entries.splice(startIndex || 0);
  if (entries) {
    entries.forEach(function(entry) {
      self.push(entry);
    });
  }
};

L.last = function last() {
  return this.length ? this.entries[this.length - 1] : undefined;
};