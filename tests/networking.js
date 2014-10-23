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

var domain = require('domain');

var Client = require('../');

describe('networked clients', function() {
  var leader;
  var nodes = [];
  var dbPath = path.join(__dirname, '..', 'db', 'networked');

  rimraf.sync(dbPath);
  mkdirp.sync(dbPath);

  it('leader can get created', function(done) {
    leader = Client(
      'tcp+msgpack://localhost:8080',
      {
        dbPath: path.join(dbPath, 'leader'),
        commandTimeout: 10e3
      });

    leader.once('leader', function() {
      done();
    });
  });

  it('other nodes can get created', function(done) {
    var d = domain.create();
    d.on('error', function(err) {
      console.error(err.stack);
    });
    d.run(function() {
      var port = 8080;
      var node;
      for (var i = 1 ; i <= 4 ; i ++) {
        node = Client(
          'tcp+msgpack://localhost:' + (port + i),
          {
            dbPath: path.join(dbPath, 'node' + i),
            standby: true
          }
        );
        nodes.push(node);
      }
      done();
    });
  });

  it('leader can join other nodes', {timeout: 10e3}, function(done) {
    async.eachSeries(nodes, function(node, cb) {
      leader.join(node.id, cb);
    }, function(err) {
      if (err) {
        throw err;
      }
      done();
    });
  });

  it('allows putting', function(done) {
    leader.put('key', 'value', done);
  });

  it('allows getting', function(done) {
    leader.get('key', function(err, value) {
      if (err) {
        throw err;
      }
      assert.equal(value, 'value');
      done();
    });
  });

  it('allows batching', function(done) {
    leader.batch([
      {type: 'put', key: 'key a', value: 'value a'},
      {type: 'put', key: 'key b', value: 'value b'},
      {type: 'put', key: 'key c', value: 'value c'},
      {type: 'put', key: 'key c', value: 'value c2'},
      {type: 'del', key: 'key a'}
      ], done);
  });

  it('batch worked', function(done) {
    async.map(['key b', 'key c'], leader.get.bind(leader), resulted);

    function resulted(err, results) {
      if (err) {
        throw err;
      }
      assert.deepEqual(results, ['value b', 'value c2']);

      leader.get('key a', function(err) {
        assert(err && err.notFound);
        done();
      });
    }
  });

  it('can create a read stream with no args', function(done) {
    leader.createReadStream().pipe(concat(function(values) {
      assert.deepEqual(values, [
        {key: 'key', value: 'value'},
        {key: 'key b', value: 'value b'},
        {key: 'key c', value: 'value c2'}
        ]);
      done();
    }));
  });

  it('can create a read stream with some args', function(done) {
    leader.createReadStream({
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
    var ws = leader.createWriteStream();

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
    leader.createReadStream({
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

  it('closes', {timeout: 10e3}, function(done) {
    leader.close(function() {
      async.each(nodes, closeNode, done);
    });

    function closeNode(node, cb) {
      node.close(cb);
    }
  });
});
