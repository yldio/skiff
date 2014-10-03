'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var Node = require('./_node');
var transport = require('./_transport');

describe('leader', function() {

  it('sends heartbeat immediately after becoming leader', function(done) {
    var node = Node();

    var peers = [uuid(), uuid()];
    peers.forEach(function(peer) {
      node.join(peer);
      transport.listen(peer, peerListen);
    });

    var heartbeats = 0;

    function peerListen(type, args, cb) {
      switch(type) {
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

      cb();

      heartbeats ++;
      if (heartbeats == peers.length) done();
    }
  });

  it('accepts new entries from the client and broadcasts it', function(done) {
    var node = Node();

    var peers = [uuid(), uuid()];
    peers.forEach(function(peer) {
      node.join(peer);
      transport.listen(peer, peerListen(peer));
    });

    var expectedEntries = [
      [],
      [{term: 1, command: 'COMMAND 1'}]
    ];
    var nodeAppendEntriesCount = {};
    peers.forEach(function(peer) {
      nodeAppendEntriesCount[peer] = 0;
    });

    function peerListen(id) {
      return function (type, args, cb) {
        switch(type) {
          case 'RequestVote':
            handleRequestVote(args, cb);
            break;
          case 'AppendEntries':
            handleAppendEntries(args, cb);
            break;
        }
       }

       function handleAppendEntries(args, cb) {
         var idx = (++ nodeAppendEntriesCount[id]) - 1;
         var entries = expectedEntries[idx];
         assert.deepEqual(args.entries, entries);
         cb(null, {success: true});
       }
    }

    function handleRequestVote(args, cb) {
      cb(null, {voteGranted: true});
    }

    node.once('leader', function() {
      node.command('COMMAND 1', function(err) {
        if (err) throw err;
        assert.equal(nodeAppendEntriesCount[peers[0]], 2);
        done();
      });
    });

  });
});