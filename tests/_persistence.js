'use strict';

var Readable = require('stream').Readable;
var Writable = require('stream').Writable;

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

exports.applyCommand = applyCommand;

function applyCommand(nodeId, commitIndex, command, callback) {
  setTimeout(function() {
    if (!store.commands[nodeId]) {
      store.commands[nodeId] = [];
    }
    store.commands[nodeId].push(command);
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

exports.createReadStream = createReadStream;

function createReadStream(nodeId) {
  var stream = new Readable({objectMode: true});
  var commandIndex = -1;
  var finished = false;
  var commands = store.commands[nodeId] || [];
  var length = commands.length;

  stream._read = function _read() {
    var command;
    commandIndex += 1;
    if (commandIndex < length) {
      command = commands && commands[commandIndex];
    }
    if (!command && !finished) {
      finished = true;
      stream.push(null);
    } else if (command) {
      stream.push(command);
    }
  };

  return stream;
}

exports.createWriteStream = createWriteStream;

function createWriteStream(nodeId) {
  store.commands[nodeId] = [];
  var stream = new Writable({objectMode: true});
  stream._write = function _write(chunk, encoding, callback) {
    store.commands[nodeId].push(chunk);
    setImmediate(callback);
  };

  return stream;
}
