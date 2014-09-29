'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Node = require('../');
var Peer = require('../lib/peer');
var transport = require('./_transport');

describe('node', function() {

  it('can create node with new and without options', function(done) {
    var node = Node();
    assert.instanceOf(node, Node);
    done();
  });

  it('can create node without new and with no options', function(done) {
    var node = Node();
    assert.instanceOf(node, Node);
    assert.typeOf(node.options, 'object');
    assert.typeOf(node.cluster, 'object');
    done();
	});

  it('starts with an empty list of peers', function(done) {
    var node = Node();
    assert.isArray(node.peers);
    assert.equal(node.peers.length, 0);
    done();
  });

  it('cannot join a peer without transport', function(done) {
    var node = Node();
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
    var node = Node({transport: transport});
    node.join({'hostname': 'somehostname', port: 'someport'});
    assert.equal(node.peers.length, 1);
    assert.instanceOf(node.peers[0], Peer);
    done();
  });

});