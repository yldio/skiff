'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var Node = require('./_node2');

function log() {
  var s = arguments[0] || '';
  s = '[' + Date.now() + '] ' + s;
  arguments[0] = s;
  console.log.apply(console, arguments);
}

describe('cluster', function() {

  it('elects one leader', function(done) {
    var nodes = [];
    var leader;

    for(var i = 0 ; i < 5 ; i ++) {
      nodes.push(Node());
    }

    nodes.forEach(function(node, index) {
      nodes.forEach(function(node2, index) {
        if (node != node2) node.join(node2.id);
      });
      node.once('leader', function() {
        leader = node.id;
      });
    });

    setTimeout(function() {
      var states = nodes.map(function(node) {
        return node.state.name;
      });
      assert.deepEqual(states.sort(), ['follower', 'follower', 'follower', 'follower', 'leader']);
      nodes.forEach(function(node) {
        assert.equal(node.currentTerm(), 1);
        assert.equal(node.commonState.volatile.leaderId, leader);
      });
      done();
    }, 1e3);

  });

});