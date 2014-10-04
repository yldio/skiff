'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var Node = require('./_node2');
var persistence = require('./_persistence');

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

  it('commands work and get persisted', {timeout: 10e3}, function(done) {
    var MAX_COMMANDS = 20;
    var nodes = [];
    var leader;

    for(var i = 0 ; i < 5 ; i ++) {
      nodes.push(Node());
    }

    nodes.forEach(function(node, index) {
      nodes.forEach(function(node2, index) {
        if (node != node2) node.join(node2.id);
      });
      node.once('leader', onLeader);
    });

    var commands = [];
    var index = 0;

    function onLeader(leader) {
      pushCommand();

      function pushCommand() {
        var cmd = ++ index;
        commands.push(cmd);
        leader.command(cmd, commanded);
      }

      function commanded(err) {
        if (err) throw err;
        if (index < MAX_COMMANDS) pushCommand();
        else {
          setTimeout(function() {
            nodes.forEach(function(node) {
              assert.deepEqual(persistence.store.commands[node.id], commands);
            });
            done();
          }, 1e3);
        }
      }
    }
  });

});