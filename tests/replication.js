'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var path = require('path');
var async = require('async');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var concat = require('concat-stream');

var Client = require('../');

describe('cluster', function() {
  var leader;
  var node;
  var dbPath = path.join(__dirname, '..', 'db', 'replication');

  rimraf.sync(dbPath);
  mkdirp.sync(dbPath);

  var data = [];
  for (var i = 1 ; i <= 20; i ++) {
    data.push('data ' + i);
  }

  it('leader can get created', function(done) {
    leader = Client(
      'tcp+msgpack://localhost:8100',
      {
        dbPath: path.join(dbPath, 'leader'),
        commandTimeout: 10e3,
        retainedLogEntries: 10
      });

    leader.once('leader', function() {
      done();
    });
  });

  it('leader can write', {timeout: 60e3}, function(done) {
    var i = 0;
    async.eachLimit(data, 5, function(d, cb) {
      i ++;
      leader.put(pack(i), d, cb);
    }, done);
  });

  it('leader has all the data', function(done) {
    leader.createReadStream().pipe(concat(read));

    function read(values) {
      assert.deepEqual(values.map(function(rec) {
        return rec.value;
      }), data);
      done();
    }
  });

  it('can join additional node that eventually syncs', {timeout: 10e3},
    function(done) {
      node = Client(
        'tcp+msgpack://localhost:8103',
        {
          dbPath: path.join(dbPath, 'node' + i),
          standby: true
        }
      );

      var count = 0;
      node.on('InstallSnapshot', function() {
        count ++;
        if (count == data.length) {
          setTimeout(function() {
            node.createReadStream().pipe(concat(read));
          }, 1e3);
        }
      });

      function read(values) {
        assert.deepEqual(values.map(function(rec) {
          return rec.value;
        }), data);
        done();
      }

      leader.join(node.id, function(err) {
        if (err) {
          throw err;
        }
      });

    }
  );
});

function pack(i) {
  var out = '';
  if (i < 100) {
    out += '0';
  }
  if (i < 10) {
    out += '0';
  }
  out += i;
  return out;
}
