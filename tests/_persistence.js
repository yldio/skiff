'use strict';

var store = {
  meta: {},
  state: {}
};

exports.saveMeta = saveMeta;

function saveMeta(nodeId, state, callback) {
  store.meta[nodeId] = JSON.stringify(state);
  setImmediate(callback);
}


exports.loadMeta = loadMeta;

function loadMeta(nodeId, callback) {
  var data = store.meta[nodeId];
  if (data) data = JSON.parse(data);
  setImmediate(callback, null, data);
}


exports.applyLog = applyLog;

function applyLog(nodeId, commitIndex, log, callback) {
  setImmediate(function() {
    store.state[nodeId] = commitIndex;
    callback();
  });
}


exports.lastAppliedCommitIndex = lastAppliedCommitIndex;

function lastAppliedCommitIndex(nodeId, callback) {
  var commitIndex = store.meta[nodeId];
  setImmediate(callback, null, commitIndex);
}
