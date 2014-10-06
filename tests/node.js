'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var Peer = require('../lib/peer');
var NodeC = require('./_node');
var transport = require('./_transport');

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
    assert.isArray(node.peers);
    assert.equal(node.peers.length, 0);
    done();
  });

  it('cannot join a peer without transport', function(done) {
    var node = NodeC({transport: null});
    assert.throws(function() {
      node.join('hostname:port');
    }, 'No transport defined');
    done();
  });

  it('can join a peer', function(done) {
    var node = NodeC();
    var peer = Peer('someid', {transport: transport});
    node.join(peer);
    assert.equal(node.peers.length, 1);
    assert.equal(node.peers[0], peer);
    done();
  });

  it('can join a peer by desc', function(done) {
    var node = NodeC();
    node.join('hostname:port');
    assert.equal(node.peers.length, 1);
    assert.instanceOf(node.peers[0], Peer);
    done();
  });
});
