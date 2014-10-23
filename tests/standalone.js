'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var path = require('path');
var async = require('async');
var concat = require('concat-stream');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');

var Client = require('../');

describe('standalone client', function() {
  var client;
  var dbPath = path.join(__dirname, '..', 'db', 'standalone');

  rimraf.sync(dbPath);
  mkdirp.sync(dbPath);

  it('can get created', function(done) {
    client = Client('tcp+msgpack://localhost:8050', {dbPath: dbPath});
    done();
  });

  it('emits the leader event', {timeout: 10e3}, function(done) {
    client.once('leader', function() {
      done();
    });
  });

  it('allows putting', function(done) {
    client.put('key', 'value', done);
  });

  it('allows getting', function(done) {
    client.get('key', function(err, value) {
      if (err) {
        throw err;
      }
      assert.equal(value, 'value');
      done();
    });
  });

  it('allows batching', function(done) {
    client.batch([
      {type: 'put', key: 'key a', value: 'value a'},
      {type: 'put', key: 'key b', value: 'value b'},
      {type: 'put', key: 'key c', value: 'value c'},
      {type: 'put', key: 'key c', value: 'value c2'},
      {type: 'del', key: 'key a'}
      ], done);
  });

  it('batch worked', function(done) {
    async.map(['key b', 'key c'], client.get.bind(client), resulted);

    function resulted(err, results) {
      if (err) {
        throw err;
      }
      assert.deepEqual(results, ['value b', 'value c2']);

      client.get('key a', function(err) {
        assert(err && err.notFound);
        done();
      });
    }
  });

  it('can create a read stream with no args', function(done) {
    client.createReadStream().pipe(concat(function(values) {
      assert.deepEqual(values, [
        {key: 'key', value: 'value'},
        {key: 'key b', value: 'value b'},
        {key: 'key c', value: 'value c2'}
        ]);
      done();
    }));
  });

  it('can create a read stream with some args', function(done) {
    client.createReadStream({
      gte: 'key b',
      lte: 'key c'
    }).pipe(concat(function(values) {
      assert.deepEqual(values, [
        {key: 'key b', value: 'value b'},
        {key: 'key c', value: 'value c2'}
        ]);
      done();
    }));
  });

  it('can create a write stream', function(done) {
    var ws = client.createWriteStream();

    ws.write({
      key: 'key d',
      value: 'value d'
    });
    ws.write({
      key: 'key e',
      value: 'value e'
    });
    ws.end({
      key: 'key f',
      value: 'value f'
    });

    ws.once('finish', done);
  });

  it('write stream worked', function(done) {
    client.createReadStream({
      gte: 'key d',
      lte: 'key f'
    }).pipe(concat(function(values) {
      assert.deepEqual(values, [
        {key: 'key d', value: 'value d'},
        {key: 'key e', value: 'value e'},
        {key: 'key f', value: 'value f'}
        ]);
      done();
    }));
  });

  it('closes', function(done) {
    client.close(done);
  });
});
