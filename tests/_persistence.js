'use strict';

var store = {
  meta: {},
  state: {}
};

/*
* `saveMeta(nodeId, state, callback)` — saves the raft engine metadata. `nodeId` is a string that represents the current node. `state` is an arbitrary object (hash map) and `callback` is a function with the signature `function callback(err)`;
* `loadMeta(nodeId, callback)` — loads the engine metadata state. `callback` is a function with the signature `function callback(err, state)`;
* `applyLog(nodeId, commitIndex, log, callback)` - applies a log entry to the node state machine.
  * Persistence layer should save the commitIndex if it wants to make sure that log entries are not repeated.
  * Saving this should be atomic: the `commitIndex` and the log application to the state machine should be successful or fail entirely.
  * If the commitIndex has already been applied in the past, just callback with success.
  `callback` is a function with the following signature: `function callback(err)`.
* `lastAppliedCommitIndex(nodeId, callback)` - returns the last `commitIndex` that was successfully applied to the node state machine.
  * is asynchronous: `callback` is a function invoked once the result is ready
  * `callback` is a function with the following signature: `function(err, commitIndex)` - if operation resulted in error, `err` contains an error object. Otherwise, `commitIndex` may contain an integer with the index of the latest applied `commitIndex` if there was one.
*/

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
