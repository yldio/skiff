'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var Node = require('./_node');

describe('follower state', function() {

  it('is the default state', function(done) {
    var node = Node();
    node.once('state', function(state) {
      assert.equal(state, 'follower');
      done();
    });
  });

  it('election timeout transforms into candidate', function(done) {
    var node = Node();
    assert.typeOf(node.options.maxElectionTimeout, 'number');
    node.once('election timeout', function() {
      node.once('state', function(state) {
        assert.equal(state, 'candidate');
        done();
      });
    });
  });
});