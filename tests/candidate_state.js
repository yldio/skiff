'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var Node = require('./_node');

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
});