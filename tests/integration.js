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
    Cluster(5, onLeader);

    function onLeader(leader, nodes) {
      setTimeout(function() {
        assert.equal(nodes.length, 4);
        assert.equal(leader.state.name, 'leader');
        assert.equal(leader.commonState.volatile.leaderId, leader.id);
        nodes.forEach(function(node) {
          assert.equal(node.state.name, 'follower');
          assert(node.currentTerm() >= 1);
          assert.equal(node.commonState.volatile.leaderId, leader.id);
        });
        done();
      }, 1e3);
    };
  });

  it('commands work and get persisted', {timeout: 10e3}, function(done) {
    var MAX_COMMANDS = 50;

    Cluster(5, onLeader);

    var commands = [];
    var index = 0;

    function onLeader(leader, nodes) {
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
            });
            done();
          }, 1e3);
        }
      }
    }
  });

  it('allows adding a node in-flight (topology change)', {timeout: 5e3}, function(done) {
    Cluster(5, onLeader);

    function onLeader(leader) {
      var node = NodeC({standby: true});
      node.listen(node.id);

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

  it('allows removing a node in-flight that is not the leader', function(done) {
    Cluster(5, onLeader);

    function onLeader(leader, nodes) {
      var node = nodes[0];
      leader.leave(node.id, left);

      function left(err) {
        if (err) {
          throw err;
        }
        done();
      }
    }
  });

  it('allows removing a node in-flight that is the leader', function(done) {
    Cluster(5, onLeader);

    function onLeader(leader, nodes) {
      leader.leave(leader.id, left);

      nodes.forEach(function(node) {
        node.once('leader', onNewLeader);
      });

      function left(err) {
        if (err) {
          throw err;
        }
      }

      var oneLeader = false;
      function onNewLeader(node) {
        if (! oneLeader) {
          oneLeader = true;
          setTimeout(function() {
            var states = nodes.map(function(node) {
              return node.state.name;
            }).sort();
            assert.deepEqual(states, ['follower', 'follower', 'follower', 'leader']);
            done();
          }, 1e3);
        }
      }
    }
  });

  it('allows 2 nodes to start talking to each other', function(done) {
    var leader = NodeC();
    var follower = NodeC({standby: true});
    follower.listen(follower.id);

    leader.once('leader', function() {
      leader.join(follower.id, joined);
    });

    function joined(err) {
      if (err) {
        throw err;
      }

      leader.command('COMMAND', commanded);
    }

    function commanded(err) {
      if (err) {
        throw err;
      }

      setTimeout(function() {
        assert.deepEqual(persistence.store.commands[follower.id], ['COMMAND']);
        done();
      }, 1e3);
    }
  });

  it('separating 2 nodes from 3 node cluster makes node become leader', function(done) {
    Cluster(3, onLeader);

    function onLeader(leader, nodes) {
      leader.leave(leader.id);

      nodes.forEach(function(node) {
        node.once('leader', onNewLeader);
      });

      var gotNewLeader = false;
      var follower;

      function onNewLeader(newLeader) {
        if (! gotNewLeader) {
          gotNewLeader = true;
          follower = nodes[(nodes.indexOf(newLeader) + 1) %2];
          newLeader.leave(newLeader.id);
          follower.once('leader', onNewNewLeader);
        }
      }

      function onNewNewLeader(newNewLeader) {
        assert.equal(newNewLeader, follower);
        done();
      }

     };
  });

});
