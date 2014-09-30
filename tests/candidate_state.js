'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var Node = require('./_node');
var transport = require('./_transport');

describe('candidate state', function() {

  it('reaches leader state if alone', function(done) {
    var node = Node();

    var states = ['follower', 'candidate', 'leader'];

    node.on('state', function(state) {
      assert.equal(state, states.shift());
      if (! states.length) {
        assert.equal(node.commonState.persisted.currentTerm, 1);
        done();
      }
    });
  });

  it('doesnt reach leader if cannot get majority', function(done) {
    var node = Node();
    var remotes = [uuid(), uuid()];

    remotes.forEach(function(id) {
      node.join(id);
    });

    node.on('error', console.log);

    var states = ['follower', 'candidate', 'candidate', 'candidate'];

    node.on('state', function(state) {
      assert.equal(state, states.shift());
      if (! states.length) {
        assert.equal(node.commonState.persisted.currentTerm, 2);
        done();
      }
    });
  });

  it('reaches leader if can get all the votes', function(done) {
    var node = Node();
    var remotes = [uuid(), uuid()];
    remotes.forEach(function(id) {
      transport.listen(id, listen);
      node.join(id);
    });

    var states = ['follower', 'candidate', 'leader'];

    node.on('state', function(state) {
      assert.equal(state, states.shift());
      if (! states.length) {
        assert.equal(node.commonState.persisted.currentTerm, 1);
        done();
      }
    });

    var voteRequests = 0;

    function listen(type, args, cb) {
      assert.equal(type, 'RequestVote');
      assert.equal(args.term, 1);
      assert.equal(args.lastLogIndex, 1);
      assert((++ voteRequests) <= remotes.length);
      cb(null, {voteGranted: true});
    }
  });

});