'use strict';

var store = {};

module.exports = Persistence;

function Persistence(id) {
  this.id = id;
}

var P = Persistence.prototype;

P.save = function save(state, callback) {
  store[this.id] = JSON.stringify(state);
  setImmediate(callback);
};

P.load = function load(callback) {
  var state = store[this.id];
  setImmediate(function() {
    if (state) state = JSON.parse(state);
    callback(null, state);
  });
};