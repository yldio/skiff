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
});