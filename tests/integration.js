'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var NodeC = require('./_node2');
// var debug = require('./_debug');
var persistence = require('./_persistence');

describe('cluster', function() {

  it('elects one leader', function(done) {
    var nodes = [];
    var leader;

    for (var i = 0 ; i < 5 ; i ++) {
      nodes.push(NodeC());
    }

    nodes.forEach(function(node, index) {

      nodes.forEach(function(node2) {
        if (node != node2) {
          node._join(node2.id);
        }
      });

      node.once('leader', function() {
        leader = node.id;
        setTimeout(function() {
          var states = nodes.map(function(node) {
            return node.state.name;
          });
          assert.deepEqual(states.sort(),
            ['follower', 'follower', 'follower', 'follower', 'leader']);
          nodes.forEach(function(node) {
            assert(node.currentTerm() >= 1);
            assert.equal(node.commonState.volatile.leaderId, leader);
          });
          done();
        }, 1000);
      });
    });

  });

  it('commands work and get persisted', {timeout: 10e3}, function(done) {
    var MAX_COMMANDS = 50;
    var nodes = [];

    for (var i = 0 ; i < 5 ; i ++) {
      nodes.push(NodeC());
    }

    nodes.forEach(function(node) {
      nodes.forEach(function(node2) {
        if (node != node2) {
          node._join(node2.id);
        }
      });
      node.once('leader', onLeader);
    });

    var commands = [];
    var index = 0;

    function onLeader(leader) {
      // debug(leader);
      pushCommand();

      function pushCommand() {
        var cmd = ++index;
        commands.push(cmd);
        leader.command(cmd, commanded);
      }

      function commanded(err) {
        if (err) {
          throw err;
        }
        if (index < MAX_COMMANDS) {
          pushCommand();
        }
        else {
          setTimeout(function() {
            nodes.forEach(function(node, index) {
              assert.deepEqual(persistence.store.commands[node.id], commands);
              if (node == leader) {
                assert.equal(node.state.name, 'leader');
              }
              else {
                assert.equal(node.state.name, 'follower');
              }
            });
            done();
          }, 1e3);
        }
      }
    }
  });

});
