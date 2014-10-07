'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var NodeC = require('./_node');
var transport = require('./_transport');

describe('leader', function() {

  it('sends heartbeat immediately after becoming leader', function(done) {
    var node = NodeC();

    var peers = [uuid(), uuid()];
    peers.forEach(function(peer) {
      node._join(peer);
      transport.listen(peer, peerListen);
    });

    var heartbeats = 0;

    function peerListen(type, args, cb) {
      switch (type) {
        case 'RequestVote':
          handleRequestVote(args, cb);
          break;
        case 'AppendEntries':
          handleAppendEntries(args, cb);
          break;
      }
    }

    function handleRequestVote(args, cb) {
      cb(null, {voteGranted: true});
    }

    function handleAppendEntries(args, cb) {
      assert.equal(args.term, 1);
      assert.equal(args.leaderId, node.id);
      assert.deepEqual(args.entries, []);

      cb(null, {success: true});

      heartbeats ++;
      if (heartbeats == peers.length * 10) {
        done();
      }
    }
  });

  it('handles peer append entries failures by backing off', function(done) {
    var node = NodeC();

    node.commonState.persisted.log.push({term: 1, command: 'COMMAND 1'});
    node.commonState.persisted.log.push({term: 1, command: 'COMMAND 2'});

    var peers = [uuid(), uuid()];
    peers.forEach(function(peer, index) {
      node._join(peer);
      transport.listen(peer, peerListen(peer, index));
    });

    var expectedIndexes = [3, 2, 1, 0, 1, 2];
    var expectedEntries = [
      [],
      [{term: 1, command: 'COMMAND 2'}],
      [{term: 1, command: 'COMMAND 1'}],
      [{term: 1, command: 'COMMAND 2'}],
      [{term: 1, command: 'COMMAND 3'}]
    ];
    var nodeAppendEntriesCount = {};
    peers.forEach(function(peer) {
      nodeAppendEntriesCount[peer] = 0;
    });

    function peerListen(id) {
      var lastIndex = 0;
      return function(type, args, cb) {
        switch (type) {
          case 'RequestVote':
            handleRequestVote(args, cb);
            break;
          case 'AppendEntries':
            handleAppendEntries(args, cb);
            break;
        }
      };

      function handleAppendEntries(args, cb) {
        if (nodeAppendEntriesCount[id] < expectedIndexes.length) {
          nodeAppendEntriesCount[id] ++;
          assert.equal(
            args.prevLogIndex, expectedIndexes[nodeAppendEntriesCount[id]]);
          assert.deepEqual(
            args.entries, expectedEntries[nodeAppendEntriesCount[id] - 1]);
        }

        if (args.prevLogIndex <= lastIndex) {
          lastIndex = args.prevLogIndex + args.entries.length;
          cb(null, {success: true});
        }
        else {
          cb(null, {success: false});
        }
      }
    }

    function handleRequestVote(args, cb) {
      cb(null, {voteGranted: true});
    }

    node.once('leader', function() {
      node.command('COMMAND 3', function(err) {
        if (err) {
          throw err;
        }
        node.stop(done);
      });
    });
  });
});
