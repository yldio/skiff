'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var Peer = require('../lib/peer');
var Node = require('./_node');
var transport = require('./_transport');

describe('node', function() {

  it('errors if maxElectionTimeout < minElectionTimeout', function(done) {
    var node = Node({
      minElectionTimeout: 2,
      maxElectionTimeout: 1
    });

    var replied = false;
    node.on('error', function(err) {
      if (! replied) {
        replied = true;
        assert.equal(err.message,
          'maxElectionTimeout is greater than minElectionTimeout');
        done();
      }
    });
  });

  it('cannot travel to unknown state', function(done) {
    var node = Node();
    assert.throws(function() {
      node.toState('someonemistypedthestate');
    }, 'Unknown state: someonemistypedthestate');
    done();
  });

  it('starts with an empty list of peers', function(done) {
    var node = Node();
    assert.isArray(node.peers);
    assert.equal(node.peers.length, 0);
    done();
  });

  it('cannot join a peer without transport', function(done) {
    var node = Node({transport: null});
    assert.throws(function() {
      node.join({'hostname': 'somehostname', port: 'someport'});
    }, 'No transport defined');
    done();
  });

  it('can join a peer', function(done) {
    var node = Node();
    var peer = Peer(undefined, {transport: transport});
    node.join(peer);
    assert.equal(node.peers.length, 1);
    assert.equal(node.peers[0], peer);
    done();
  });

  it('can join a peer by desc', function(done) {
    var node = Node();
    node.join({'hostname': 'somehostname', port: 'someport'});
    assert.equal(node.peers.length, 1);
    assert.instanceOf(node.peers[0], Peer);
    done();
  });

});