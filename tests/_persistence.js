'use strict';

var assert = require('assert');

var store = {
  meta: {},
  state: {},
  commands: {}
};

exports.store = store;

exports.saveMeta = saveMeta;

function saveMeta(nodeId, state, callback) {
  setTimeout(function() {
    store.meta[nodeId] = JSON.stringify(state);
    callback();
  }, randomTimeout());
}

exports.loadMeta = loadMeta;

function loadMeta(nodeId, callback) {
  var data = store.meta[nodeId];
  if (data) {
    data = JSON.parse(data);
  }
  setImmediate(callback, null, data);
}

exports.applyLog = applyLog;

function applyLog(nodeId, commitIndex, log, callback) {
  assert(log, 'empty log');
  setTimeout(function() {
    if (!store.commands[nodeId]) {
      store.commands[nodeId] = [];
    }
    store.commands[nodeId].push(log.command);
    store.state[nodeId] = commitIndex;
    callback();
  }, randomTimeout());
}

exports.lastAppliedCommitIndex = lastAppliedCommitIndex;

function lastAppliedCommitIndex(nodeId, callback) {
  var commitIndex = store.meta[nodeId];
  setTimeout(callback, 5, null, commitIndex);
}

exports.saveCommitIndex = saveCommitIndex;

function saveCommitIndex(nodeId, commitIndex, cb) {
  setTimeout(function() {
    store.state[nodeId] = commitIndex;
    cb();
  }, randomTimeout());
}

function randomTimeout() {
  return Math.floor(Math.random() * 5);
}
