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

    function replied(err, args) {
      if (err) throw err;
      assert.notOk(args.success);
      assert.equal(args.term, 2);
      done();
    }
  });

  it('replies true to append entries if term = current term', function(done) {
    var node = Node();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node.join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 1}, replied);

    function replied(err, args) {
      if (err) throw err;
      assert.ok(args.success);
      done();
    }
  });

  it('replies true to append entries and stores it if term > current term', function(done) {
    var node = Node();

    node.commonState.persisted.currentTerm = 1;

    var peer = uuid();
    node.join(peer);

    transport.invoke(peer, 'AppendEntries', {term: 2}, replied);

    function replied(err, args) {
      if (err) throw err;
      assert.ok(args.success);
      assert.equal(node.currentTerm(), 2);
      done();
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

    function replied(err, args) {
      assert.ok(args.success);
      assert.equal(args.term, node.currentTerm());
      done();
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

    function replied(err, args) {
      assert.ok(args.success);
      assert.equal(node.currentTerm(), 2);
      entries.forEach(function(entry, index) {
        assert.deepEqual(node.commonState.persisted.log[index], entry);
      });
      done();
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

    function replied(err, args) {
      assert.ok(args.success);
      assert.equal(node.currentTerm(), 2);
      assert.equal(node.commonState.persisted.log.length, 3);
      assert.deepEqual(node.commonState.persisted.log[0], {term: 1});
      entries.forEach(function(entry, index) {
        assert.deepEqual(node.commonState.persisted.log[index + 1], entry);
      });
      done();
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
      entries: entries
    };
    transport.invoke(peer, 'AppendEntries', args, replied);

    function replied(err, args) {
      assert.ok(args.success);
      assert.equal(node.currentTerm(), 2);
      assert.equal(node.commonState.persisted.log.length, 3);
      assert.deepEqual(node.commonState.persisted.log[0], {term: 1});
      entries.forEach(function(entry, index) {
        assert.deepEqual(node.commonState.persisted.log[index + 1], entry);
      });
      done();
    }
  });

});