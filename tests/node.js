'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var NodeC = require('./_node');

describe('node', function() {

  it('errors if maxElectionTimeout < minElectionTimeout', function(done) {
    var node = NodeC({
      minElectionTimeout: 2,
      maxElectionTimeout: 1
    });

    var isDone = false;
    node.on('error', function(err) {
      if (!isDone) {
        isDone = true;
        assert.equal(err.message,
          'maxElectionTimeout is greater than minElectionTimeout');
        done();
      }
    });
  });

  it('cannot travel to unknown state', function(done) {
    var node = NodeC();
    assert.throws(function() {
      node.toState('someonemistypedthestate');
    }, 'Unknown state: someonemistypedthestate');
    done();
  });

  it('starts with an empty list of peers', function(done) {
    var node = NodeC();
    assert.isArray(node.commonState.persisted.peers);
    assert.equal(node.commonState.persisted.peers.length, 0);
    done();
  });

  it('cannot join a peer without transport', function(done) {
    assert.throws(function() {
      NodeC({transport: null});
    }, 'need options.transport');
    done();
  });
});
