'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Node = require('../');
var transport = require('./_transport');

describe('follower state', function() {

  it('is the default state', function(done) {
    var node = Node({transport: transport});
    assert.equal(node.state.name, 'follower');
    done();
  });

  it('election timeout transforms into candidate', function(done) {
    var node = Node({transport: transport});
    assert.typeOf(node.options.maxElectionTimeout, 'number');
    node.once('election timeout', function() {
      assert.equal(node.state.name, 'candidate');
      done();
    });
  });
});