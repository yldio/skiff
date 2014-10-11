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

  it('forwards errors in log applier to self', function(done) {
    var node = NodeC();

    node.once('error', function(err) {
      assert(err instanceof Error);
      assert.equal(err.message, 'ayay');
      done();
    });

    node.logApplier.emit('error', new Error('ayay'));
  });
});
