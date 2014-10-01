'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var Node = require('./_node');
var transport = require('./_transport');

describe('follower', function() {

  it('is the default state', function(done) {
    var node = Node();
    node.once('state', function(state) {
      assert.equal(state, 'follower');
      done();
    });
  });

  it('transforms into candidate when election timeout', function(done) {
    var node = Node();
    assert.typeOf(node.options.maxElectionTimeout, 'number');
    node.once('election timeout', function() {
      node.once('state', function(state) {
        assert.equal(state, 'candidate');
        done();
      });
    });
  });

  it('replied false to append entries if term < current term', function(done) {
    var node = Node();

    node.commonState.persisted.currentTerm = 2;

    var peer = uuid();
    node.join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 1}, replied);

    function replied(err, args) {
      if (err) throw err;
      assert.notOk(args.success);
      done();
    }
  });
});