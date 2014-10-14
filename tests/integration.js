'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var uuid = require('cuid');
var async = require('async');
var NodeC = require('./_node2');
var NodeCC = require('../');
var Cluster = require('./_cluster2');
var persistence = require('./_persistence');
var Transport = require('./_transport2');

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
    }
  });

  it('commands work and get persisted', {timeout: 10e3}, function(done) {
    var MAX_COMMANDS = 50;

    Cluster(3, onLeader);

    var commands = [];
    var index = 0;

    function onLeader(leader, nodes) {
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
            nodes.forEach(function(node) {
              assert.deepEqual(persistence.store.commands[node.id], commands);
            });
            done();
          }, 1e3);
        }
      }
    }
  });

  it('allows adding a node in-flight (topology change)', {timeout: 5e3},
    function(done) {
      Cluster(5, onLeader);

      function onLeader(leader) {
        var node = NodeC({standby: true});
        node.listen(node.id);

        leader.join(node.id, joined);

        function joined(err) {
          if (err) {
            throw err;
          }

          var commands = [];

          for (var i = 0 ; i < 10 ; i ++) {
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
    }
  );

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

  it('allows removing a node in-flight that is the leader', {timeout: 6e3},
    function(done) {
      var oneNewLeader = false;

      Cluster(5, onLeader);

      function onLeader(leader, nodes) {
        nodes.forEach(function(node) {
          node.once('leader', onNewLeader);
        });

        setTimeout(function() {
          leader.leave(leader.id);

        }, 1e3);

      }

      function onNewLeader() {
        if (!oneNewLeader) {
          oneNewLeader = true;
          done();
        }
      }
    }
  );

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

  it('removing all nodes but 1 makes sole node leader', {timeout: 10e3},
    function(done) {
      Cluster(3, onLeader);

      function onLeader(leader, nodes) {
        leader.leave(leader.id);

        nodes.forEach(function(node) {
          node.once('leader', onNewLeader);
        });

        var gotNewLeader = false;
        var follower;

        function onNewLeader(newLeader) {
          if (!gotNewLeader) {
            gotNewLeader = true;
            follower = nodes[(nodes.indexOf(newLeader) + 1) % 2];
            newLeader.leave(newLeader.id);
            follower.once('leader', onNewNewLeader);
          }
        }

        function onNewNewLeader() {
          done();
        }
      }
    }
  );

  it('fails to emit a command if the majority is not reachable', {timeout: 6e3},
    function(done) {
      var id = uuid();
      var options = {
        standby: false,
        id: id,
        transport: new Transport(id),
        persistence: persistence
      };
      var leader = new NodeCC(options);
      var nodes = [];

      for (var i = 0 ; i < 2 ; i ++) {
        nodes.push(uuid());
      }

      leader.once('leader', onceLeader);

      function onceLeader(leader) {
        nodes.forEach(function(node) {
          leader.join(node, joinReplied);
        });

        leader.command('COMMAND', {timeout: 2e3}, onCommand);
      }

      function onCommand(err) {
        assert(err instanceof Error);
        assert.equal(err && err.message,
          'timedout trying to replicate log index 3');
        done();
      }

      var index = 0;

      function joinReplied(err) {
        index ++;
        assert(err instanceof Error);
        assert.equal(err && err.message,
          'timedout trying to replicate log index ' + index);
      }
    }
  );

});
