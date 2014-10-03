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

      cb(null, {success: true});

      heartbeats ++;
      if (heartbeats == peers.length * 10) done();
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
         if (args.entries || !args.entries.length)
           // assert.deepEqual(args.entries, entries);
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

  // it('handles peer append entries failures by backing off next index', function(done) {
  //   var node = Node();

  // node.on('outgoing call', function(peer, type, message) {
  //   console.log('outgoing call:', peer.id, type, message);
  // });

  // node.on('response', function(peer, err, args) {
  //   console.log('response:', peer.id, err, args);
  // });

  //   node.commonState.persisted.log.push({term: 1, command: 'COMMAND 1'});
  //   node.commonState.persisted.log.push({term: 1, command: 'COMMAND 2'});

  //   var peers = [uuid(), uuid()];
  //   peers.forEach(function(peer, index) {
  //     node.join(peer);
  //     transport.listen(peer, peerListen(peer, index));
  //   });

  //   var expectedIndexes = [undefined, 2, 1, 0, 1, 2];
  //   var nodeAppendEntriesCount = {};
  //   peers.forEach(function(peer) {
  //     nodeAppendEntriesCount[peer] = 0;
  //   });

  //   function peerListen(id, index) {
  //     var lastIndex = 0;
  //     return function (type, args, cb) {
  //       switch(type) {
  //         case 'RequestVote':
  //           handleRequestVote(args, cb);
  //           break;
  //         case 'AppendEntries':
  //           handleAppendEntries(args, cb);
  //           break;
  //       }
  //     }

  //     function handleAppendEntries(args, cb) {
  //       if (index == 0) console.log('handleAppendEntries', id, args);
  //       nodeAppendEntriesCount[id] ++;
  //       if (nodeAppendEntriesCount[id] < expectedIndexes.length) {
  //         assert.equal(args.prevLogIndex, expectedIndexes[nodeAppendEntriesCount[id] - 1]);
  //         if (lastIndex < args.prevLogIndex)
  //           cb(null, {success: false});
  //         else {
  //           lastIndex += args.entries.length;
  //           cb(null, {success: true});
  //         }
  //       }
  //       else cb(null, {success: true});
  //     }
  //   }

  //   function handleRequestVote(args, cb) {
  //     cb(null, {voteGranted: true});
  //   }

  //   node.once('leader', function() {
  //     node.command('COMMAND 3', function(err) {
  //       console.log('REPLIED');
  //       if (err) throw err;
  //       assert.equal(nodeAppendEntriesCount[peers[0]], 4);
  //       done();
  //     });
  //   });
  // });
});