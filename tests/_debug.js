'use strict';

function Logger(node) {
  return function log() {
    var s = arguments[0] || '';
    s = '[' + Date.now() + '] [' + node.id + '] ' + s;
    arguments[0] = s;
    console.log.apply(console, arguments);
  };
}

module.exports = debug;

function debug(node) {
  var log = Logger(node);
  node.on('state', function(state) {
    log('state:', state);
    console.trace();
  });
  node.on('AppendEntries', function(args) {
    log('-> AppendEntries: %j', args);
  });
  node.on('RequestVote', function(args) {
    log('-> RequestVote: %j', args);
  });
  node.on('vote granted', function(node) {
    log('vote granted to', node);
  });
  node.on('outgoing call', function(peer, type, message) {
    log('<- outgoing call to %s of type "%s": %j', peer.id, type, message);
  });
  node.on('response', function(peer, err, args) {
    log('<- response: %j', peer.id, err, args);
  });
  node.on('election timeout', function() {
    log('election timeout');
  });
  node.on('reply', function() {
    log('-> reply %j', arguments);
  });
  node.on('heartbeat', function() {
    log('heartbeat');
  });
  node.on('reset election timeout', function() {
    log('reset election timeout');
  });
}


debug.debug2 = function(node) {
  node.on('state', function(state) {
    log(index, state, node.currentTerm());
  });
  node.on('vote granted', function(node) {
    log(index, 'voted for', node);
  });
  node.on('AppendEntries', function(args) {
    log(index, 'AppendEntries from', args[0].leaderId);
  });
  node.on('election timeout', function() {
    log(index, 'timed out');
  });
}