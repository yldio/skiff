'use strict';

function log() {
  var s = arguments[0] || '';
  s = '[' + Date.now() + '] ' + s;
  arguments[0] = s;
  console.log.apply(console, arguments);
}

module.exports = debug;

function debug(node) {
  node.on('state', function(state) {
    log('state:', state);
  });
  node.on('AppendEntries', function(args) {
    log('-> AppendEntries:', args);
  });
  node.on('RequestVote', function(args) {
    log('-> RequestVote:', args);
  });
  node.on('vote granted', function(node) {
    log('vote granted to', node);
  });
  node.on('outgoing call', function(peer, type, message) {
    log('<- outgoing call:', peer.id, type, message);
  });
  node.on('response', function(peer, err, args) {
    log('<- response:', peer.id, err, args);
  });
  node.on('election timeout', function() {
    log('election timeout');
  });
  node.on('reply', function() {
    log('-> reply', arguments);
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