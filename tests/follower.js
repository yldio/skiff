'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var NodeC = require('./_node');
var transport = require('./_transport');

describe('follower', function() {

  it('is the default state', function(done) {
    var node = NodeC();
    node.once('state', function(state) {
      assert.equal(state, 'follower');
      done();
    });
  });

  it('replies false to request vote for lower terms', function(done) {
    var node = NodeC();
    var peer = uuid();
    node._join(peer);
    node.currentTerm(3);

    transport.invoke(peer, 'RequestVote', {
      term: 2,
      candidateId: peer,
      lastLogIndex: 10,
      lastLogTerm: 10
    }, onReply);

    function onReply(err, args) {
      if (err) {
        throw err;
      }
      assert.typeOf(args.voteGranted, 'boolean');
      assert.notOk(args.voteGranted);
      done();
    }
  });

  it('replies false to second vote request on the same term', function(done) {
    var node = NodeC();
    var peer1 = uuid();
    var peer2 = uuid();
    node._join(peer1);
    node._join(peer2);

    transport.invoke(peer1, 'RequestVote', {
      term: 2,
      candidateId: peer1,
      lastLogIndex: 0,
      lastLogTerm: 1
    }, onReply1);

    transport.invoke(peer2, 'RequestVote', {
      term: 2,
      candidateId: peer2,
      lastLogIndex: 0,
      lastLogTerm: 1
    }, onReply2);

    function onReply1(err, args) {
      if (err) {
        throw err;
      }
      assert(args.voteGranted);
    }

    function onReply2(err, args) {
      assert.typeOf(args.voteGranted, 'boolean');
      assert.equal(args.voteGranted, false);
      done();
    }

  });

  it('does not grant vote if candidate lagging behind', function(done) {
    var node = NodeC();
    var peer = uuid();
    node._join(peer);
    node.currentTerm(3);
    node.commonState.persisted.log.entries.push({
      command: 'a',
      term: 3
    });
    node.commonState.persisted.log.entries.push({
      command: 'b',
      term: 3
    });
    node.commonState.persisted.log.length = 2;

    transport.invoke(peer, 'RequestVote', {
      term: 4,
      lastLogTerm: 3,
      lastLogIndex: 1
    }, onReply);

    function onReply(err, args) {
      if (err) {
        throw err;
      }
      assert.typeOf(args.voteGranted, 'boolean');
      assert.notOk(args.voteGranted);
      done();
    }
  });

  it('does grants vote if last log term < args.lastLogTerm', function(done) {
    var node = NodeC();
    var peer = uuid();
    node._join(peer);
    node.currentTerm(3);
    node.commonState.persisted.log.entries.push({
      command: 'a',
      term: 3
    });
    node.commonState.persisted.log.entries.push({
      command: 'b',
      term: 3
    });
    node.commonState.persisted.log.length = 2;

    transport.invoke(peer, 'RequestVote', {
      term: 5,
      lastLogTerm: 4,
      lastLogIndex: 1
    }, onReply);

    function onReply(err, args) {
      if (err) {
        throw err;
      }
      assert(args.voteGranted);
      done();
    }
  });

  it('transforms into candidate when election timeout', function(done) {
    var node = NodeC();
    assert.typeOf(node.options.maxElectionTimeout, 'number');
    node.once('election timeout', function() {
      assert.equal(node.state.name, 'candidate');
      done();
    });
  });

  it('replies false to append entries if term < current term', function(done) {
    var node = NodeC();

    node.commonState.persisted.currentTerm = 2;

    var peer = uuid();
    node._join(peer);
    transport.invoke(peer, 'AppendEntries', {term: 1, WTF:'WTF'}, replied);

    function replied(err, args) {
      if (err) {
        throw err;
      }
      assert.notOk(args.success);
      assert.equal(args.term, 2);
      done();
    }
  });

  it('replies true to append entries if term = current term', function(done) {
    var node = NodeC();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node._join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 1}, replied);

    var isDone = false;

    function replied(err, args) {
      if (!isDone) {
        isDone = true;
        if (err) {
          throw err;
        }
        assert.ok(args.success);
        done();
      }
    }
  });

  it('applies append entries if term > current term', function(done) {
    var node = NodeC();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node._join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 2}, replied);

    var isDone = false;

    function replied(err, args) {
      if (!isDone) {
        isDone = true;
        if (err) {
          throw err;
        }
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        done();
      }
    }
  });

  it('replies to heartbeat', function(done) {
    var node = NodeC();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node._join(peer);

    var args = {
      term: 1,
      prevLogIndex: null,
      prevLogTerm: null,
      entries: []
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    function replied(err, args) {
      if (!isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(args.term, node.currentTerm());
        done();
      }
    }
  });

  it('applies entries if log is empty', function(done) {
    var node = NodeC();

    var peer = uuid();
    node._join(peer);

    var entries = [
      {term: 2},
      {term: 2}
    ];

    var args = {
      term: 2,
      prevLogIndex: 0,
      prevLogTerm: null,
      entries: entries
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    var isDone = false;

    function replied(err, args) {
      if (!isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        entries.forEach(function(entry, index) {
          assert.deepEqual(
            node.commonState.persisted.log.entries[index], entry);
        });
        done();
      }
    }
  });

  it('applies entries if there is no conflict', function(done) {
    var node = NodeC();

    node.commonState.persisted.log.push({term: 1});

    var peer = uuid();
    node._join(peer);

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
      if (!isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        assert.equal(node.commonState.persisted.log.length, 3);
        assert.deepEqual(node.commonState.persisted.log.entries[0], {term: 1});
        entries.forEach(function(entry, index) {
          assert.deepEqual(
            node.commonState.persisted.log.entries[index + 1], entry);
        });
        done();
      }
    }
  });

  it('applies entries if there is conflict', function(done) {
    var node = NodeC();

    node.commonState.persisted.log.push({term: 1}, {term: 2});

    var peer = uuid();
    node._join(peer);

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
      if (!isDone) {
        isDone = true;
        assert.ok(args.success);
        assert.equal(node.currentTerm(), 2);
        assert.equal(node.commonState.persisted.log.length, 3);
        assert.deepEqual(node.commonState.persisted.log.entries[0], {term: 1});
        entries.forEach(function(entry, index) {
          assert.deepEqual(
            node.commonState.persisted.log.entries[index + 1], entry);
        });
        done();
      }
    }
  });

  it('eventually persists new log entries', function(done) {
    var node = NodeC();

    node.commonState.persisted.log.push({term: 1}, {term: 2});

    assert.equal(node.commonState.volatile.commitIndex, 0);
    assert.equal(node.commonState.volatile.lastApplied, 0);

    var peer = uuid();
    node._join(peer);

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
    var didReply = false;

    node.on('applied log', function(logIndex) {
      assert.equal(logIndex, ++applied);
      if (applied == entries.length) {
        assert.equal(node.commonState.volatile.lastApplied, 2);
        assert(didReply);
        isDone = true;
        done();
      }
    });

    function replied(err) {
      if (!isDone) {
        if (err) {
          throw err;
        }
        assert.equal(node.commonState.volatile.commitIndex, 2);
        didReply = true;
      }
    }
  });
});
