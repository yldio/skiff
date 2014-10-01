'use strict';

var inherits = require('util').inherits;

module.exports = Log;

function Log() {
  Array.apply(this);
}

inherits(Log, Array);

var L = Log.prototype;

L.applyEntries = function applyEntries(startIndex, entries) {
  var self = this;
  this.splice(startIndex || 0);
  if (entries) {
    entries.forEach(function(entry) {
      self.push(entry);
    });
  }
};