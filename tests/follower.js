'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var Node = require('./_node');
var transport = require('./_transport');

describe('follower', function() {

  it('is the default state', function(done) {
    var node = Node();
    node.once('state', function(state) {
      assert.equal(state, 'follower');
      done();
    });
  });

  it('transforms into candidate when election timeout', function(done) {
    var lastState;

    var node = Node();
    assert.typeOf(node.options.maxElectionTimeout, 'number');
    node.once('election timeout', function() {
      assert.equal(lastState, 'candidate');
      done();
    });

    node.on('state', function(state) {
      lastState = state;
    });

  });

  it('replies false to append entries if term < current term', function(done) {
    var node = Node();

    node.commonState.persisted.currentTerm = 2;

    var peer = uuid();
    node.join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 1}, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        if (err) throw err;
        assert.notOk(args.success);
        assert.equal(args.term, 2);
        done();
      }
    }
  });

  it('replies true to append entries if term = current term', function(done) {
    var node = Node();

    // node.on('outgoing call', function(peer, type, message) {
    //   console.log('outgoing call:', peer.id, type, message);
    // });

    // node.on('response', function(peer, err, args) {
    //   console.log('response:', peer.id, err, args);
    // });

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node.join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 1}, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        if (err) throw err;
        assert.ok(args.success);
        done();
      }
    }
  });

  it('applies append entries if term > current term', function(done) {
    var node = Node();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node.join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 2}, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        if (err) throw err;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        done();
      }
    }
  });

  it('replies to heartbeat', function(done) {
    var node = Node();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node.join(peer);

    var args = {
      term: 1,
      prevLogIndex: null,
      prevLogTerm: null,
      entries: []
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(args.term, node.currentTerm());
        done();
      }
    }
  });

  it('applies entries if log is empty', function(done) {
    var node = Node();

    var peer = uuid();
    node.join(peer);

    var entries = [
      {term: 2},
      {term: 2}
    ];

    var args = {
      term: 2,
      prevLogIndex: null,
      prevLogTerm: null,
      entries: entries
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        entries.forEach(function(entry, index) {
          assert.deepEqual(node.commonState.persisted.log[index], entry);
        });
        done();
      }
    }
  });

  it('applies entries if there is no conflict', function(done) {
    var node = Node();

    node.commonState.persisted.log.push({term: 1});

    var peer = uuid();
    node.join(peer);

    var entries = [
      {term: 2},
      {term: 2}
    ];

    var args = {
      term: 2,
      prevLogIndex: 1,
      prevLogTerm: 1,
      entries: entries
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        assert.equal(node.commonState.persisted.log.length, 3);
        assert.deepEqual(node.commonState.persisted.log[0], {term: 1});
        entries.forEach(function(entry, index) {
          assert.deepEqual(node.commonState.persisted.log[index + 1], entry);
        });
        done();
      }
    }
  });

  it('applies entries if there is conflict', function(done) {
    var node = Node();

    node.commonState.persisted.log.push({term: 1}, {term: 2});

    var peer = uuid();
    node.join(peer);

    var entries = [
      {term: 2},
      {term: 2}
    ];

    var args = {
      term: 2,
      prevLogIndex: 1,
      prevLogTerm: 1,
      leaderCommit: 0,
      entries: entries
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    function replied(err, args) {
      if (! isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        assert.equal(node.commonState.persisted.log.length, 3);
        assert.deepEqual(node.commonState.persisted.log[0], {term: 1});
        entries.forEach(function(entry, index) {
          assert.deepEqual(node.commonState.persisted.log[index + 1], entry);
        });
        done();
      }
    }
  });

  it('eventually persists new log entries', function(done) {
    var node = Node();

    node.commonState.persisted.log.push({term: 1}, {term: 2});

    assert.equal(node.commonState.volatile.commitIndex, 0);
    assert.equal(node.commonState.volatile.lastApplied, 0);

    var peer = uuid();
    node.join(peer);

    var entries = [
      {term: 2, command: 'COMMAND 1'},
      {term: 2, command: 'COMMAND 2'}
    ];

    var args = {
      term: 2,
      prevLogIndex: 1,
      prevLogTerm: 1,
      leaderCommit: 2,
      entries: entries
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    var applied = 0;
    function replied(err) {
      if (! isDone) {
        if (err) throw err;
        assert.equal(node.commonState.volatile.commitIndex, 2);
        node.on('applied log', function(logIndex) {
          applied ++;
          assert.equal(logIndex, applied);
          if (applied == entries.length) {
            assert.equal(node.commonState.volatile.lastApplied, 2);
            isDone = true;
            done();
           }
        });
      }
    }
  });

});