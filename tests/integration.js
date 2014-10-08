'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var async = require('async');
var NodeC = require('./_node2');
var Cluster = require('./_cluster2');
var persistence = require('./_persistence');
var debug = require('./_debug');

describe('cluster', function() {

  it('elects one leader', function(done) {
    var nodes = Cluster(5);
    var leader;

    nodes.forEach(function(node, index) {
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
    var nodes = Cluster(5);

    nodes.forEach(function(node) {
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

  it('allows adding a node in-flight (topology change)', {timeout: 3e3}, function(done) {
    var nodes = Cluster(5);

    nodes.forEach(function(node) {
      node.once('leader', onLeader);
    });

    function onLeader(leader) {
      var node = NodeC({standby: true});
      node._join(leader.id);

      leader.join(node.id, joined);

      function joined(err) {
        if (err) throw err;

        var commands = [];

        for(var i = 0 ; i < 10 ; i ++) {
          commands.push(i);
        }

        async.each(commands, function(cmd, cb) {
          leader.command(cmd, cb);
        }, commanded);

        function commanded(err) {
          if (err) {
            throw err;
          }

          setTimeout(function() {
            assert.deepEqual(persistence.store.commands[node.id], commands);
            done();
          }, 2e3);
        }
      }
    }
  });

  it('allows removing a node in-flight that is not the leader', {timeout: 5e3}, function(done) {
    var nodes = Cluster(5);

    nodes.forEach(function(node) {
      node.once('leader', onLeader);
    });

    function onLeader(leader) {
      var node;
      for(var i = 0 ; i < nodes.length; i ++) {
        node = nodes[i];
        if (node != leader) break;
      }

      leader.leave(node.id, left);

      function left(err) {
        if (err) {
          throw err;
        }
        done();
      }

    }
  });

  it('allows 2 nodes to start talking to each other');

  it('separating 2 nodes from 3 node cluster makes node become leader');

});
