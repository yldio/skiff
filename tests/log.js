'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var it = lab.it;
var assert = Lab.assert;
var describe = lab.describe;

var Log = require('../lib/log');

describe('log', function() {

  it('can be created', function(done) {
    var node = 'NODE';
    var options = 'OPTIONS';
    var log = new Log(node, options);

    assert.equal(log.node, node);
    assert.equal(log.options, options);
    done();
  });

  it('can be created from a doc', function(done) {
    var doc = {
      meta: {
        lastIncludedIndex: 1001,
        lastIncludedTerm: 101
      },
      entries: ['some', 'nice', 'entries']
    };
    var log = new Log(undefined, undefined, doc);

    assert.equal(log.lastIncludedIndex, 1001);
    assert.equal(log.lastIncludedTerm, 101);
    assert.deepEqual(log.entries, ['some', 'nice', 'entries']);
    done();
  });

  it('can push and retrieve entries', function(done) {
    var log = new Log();
    log.push('entry 1');
    log.push('entry 2');

    assert.equal(log.entryAt(1), 'entry 1');
    assert.equal(log.entryAt(2), 'entry 2');
    done();
  });

  it('can push entries in bulk', function(done) {
    var log = new Log();
    log.pushEntries(0, ['entry 1', 'entry 2']);
    log.pushEntries(2, ['entry 3', 'entry 4']);
    assert.equal(log.length(), 4);
    assert.equal(log.entryAt(1), 'entry 1');
    assert.equal(log.entryAt(2), 'entry 2');
    assert.equal(log.entryAt(3), 'entry 3');
    assert.equal(log.entryAt(4), 'entry 4');
    done();
  });

  it('can push entries overriding existing ones', function(done) {
    var log = new Log();
    log.pushEntries(0, ['entry 1', 'entry 2', 'entry 3']);
    log.pushEntries(2, ['entry 3', 'entry 4', 'entry 5']);
    assert.equal(log.length(), 5);
    assert.equal(log.entryAt(1), 'entry 1');
    assert.equal(log.entryAt(2), 'entry 2');
    assert.equal(log.entryAt(3), 'entry 3');
    assert.equal(log.entryAt(4), 'entry 4');
    assert.equal(log.entryAt(5), 'entry 5');
    done();
  });

  it('doesnt compact the logs before retained count', function(done) {
    var i;
    var options = {
      retainedLogEntries: 10
    };
    var log = new Log('node', options);

    for (i = 1 ; i <= 10; i ++) {
      log.push('entry ' + i);
    }

    for (i = 1 ; i <= 10; i ++) {
      log.applied(10);
    }

    assert.equal(log.length(), 10);
    assert.equal(log.lastIncludedIndex, 0);
    assert.equal(log.lastIncludedTerm, 0);
    assert.equal(log.entries.length, 10);
    done();
  });

  it('compacts the logs after retained count is reached', function(done) {
    var options = {
      retainedLogEntries: 10
    };
    var log = new Log('node', options);

    for (var i = 1 ; i <= 30; i ++) {
      log.push({
        term: i,
        command: 'entry ' + i
      });
    }

    log.applied(20);

    assert.equal(log.length(), 30);
    assert.equal(log.lastIncludedIndex, 10);
    assert.equal(log.lastIncludedTerm, 10);
    assert.equal(log.entries.length, 20);
    done();
  });

});
