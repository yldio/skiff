'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var uuid = require('cuid');
var Node = require('../');
var NodeC = require('./_node');
var transport = require('./_transport');
var persistence = require('./_persistence');

describe('node', function() {

  it('creates an id for you', function(done) {
    var node = Node({
      transport: transport,
      persistence: persistence
    });
    assert.typeOf(node.id, 'string');
    done();
  });

  it('errors if maxElectionTimeout < minElectionTimeout', function(done) {
    var node = NodeC({
      minElectionTimeout: 2,
      maxElectionTimeout: 1
    });

    var isDone = false;
    node.on('error', function(err) {
      if (!isDone) {
        isDone = true;
        assert.equal(err.message,
          'maxElectionTimeout is greater than minElectionTimeout');
        done();
      }
    });
  });

  it('cannot travel to unknown state', function(done) {
    var node = NodeC();
    assert.throws(function() {
      node.toState('someonemistypedthestate');
    }, 'Unknown state: someonemistypedthestate');
    done();
  });

  it('starts with an empty list of peers', function(done) {
    var node = NodeC();
    assert.isArray(node.commonState.persisted.peers);
    assert.equal(node.commonState.persisted.peers.length, 0);
    done();
  });

  it('cannot join a peer without transport', function(done) {
    assert.throws(function() {
      NodeC({transport: null});
    }, 'need options.transport');
    done();
  });

  it('emits error if the loading metadata fails', function(done) {
    var loadMeta = persistence.loadMeta;

    persistence.loadMeta = function(nodeId, cb) {
      persistence.loadMeta = loadMeta;
      process.nextTick(function() {
        cb(new Error('oops'));
      });
    };
    var node = NodeC();
    node.once('error', function(err) {
      assert(err instanceof Error);
      done();
    });
  });

  it('saves peer data as ids', function(done) {
    var node = NodeC();
    var peer = uuid();
    node._join(peer);

    node.save(saved);

    function saved(err) {
      if (err) {
        throw err;
      }
      var stored = persistence.store.meta[node.id];
      if (stored) {
        stored = JSON.parse(stored);
      }
      assert.deepEqual(stored && stored.peers, [peer]);
      done();
    }
  });

  it('loads peer data from persistence', function(done) {
    var id = uuid();
    var peer = uuid();
    persistence.store.meta[id] = JSON.stringify({peers: [peer]});
    var node = NodeC({id: id});
    node.once('loaded', function() {
      assert.equal(node.commonState.persisted.peers[0].id, peer);
      done();
    });
  });

  it('paopagates error in log applier to self', function(done) {
    var node = NodeC();

    node.once('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'ayay');
      done();
    });

    node.logApplier.emit('error', new Error('ayay'));
  });

  it('propagates state error to self', function(done) {
    var node = NodeC();

    node.once('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'ayay');
      done();
    });

    node.state.emit('error', new Error('ayay'));
  });

  it('can\'t join self', function(done) {
    var node = NodeC();
    node.join(node.id, function(err) {
      assert.equal(err && err.message, 'can\'t join self');
      done();
    });
  });

  it('ignores leaving non-existing peer', function(done) {
    var node = NodeC();
    node._leave('abc');
    setTimeout(done, 1e3);
  });

  it('doesn\'t let you issue a command unless is a leader', function(done) {
    var node = NodeC();
    node.command('abc', function(err) {
      assert.equal(err && err.message, 'not the leader');
      assert.equal(err.code, 'ENOTLEADER');
      done();
    });
  });

  it('doesn\'t handle peer call after stopped', function(done) {
    var node = NodeC();
    node.stop(function(err) {
      if (err) {
        throw err;
      }
      node.handlePeerCall('peer', 'RequestVote', {what:'ever'}, replied);
    });

    function replied() {
      throw new Error('should not have replied');
    }

    setTimeout(done, 1e3);
  });

});
