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

var Client = require('../');

var domain = require('domain');

describe('resilient clients', function() {
  var leader;
  var nodes = [];
  var dbPath = path.join(__dirname, '..', 'db', 'resilience');

  rimraf.sync(dbPath);
  mkdirp.sync(dbPath);

  it('leader can get created', function(done) {
    leader = Client(
      'tcp+msgpack://localhost:8090',
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
      var port = 8090;
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

  it('leader can join other nodes', function(done) {
    async.eachSeries(nodes, function(node, cb) {
      leader.join(node.id, cb);
    }, function(err) {
      if (err) {
        throw err;
      }
      done();
    });
  });

  it('some time passes by...', {timeout: 4e3}, function(done) {
    setTimeout(done, 3e3);
  });

  it('2 nodes can quit...', {timeout: 6e3}, function(done) {
    var quitting = nodes.splice(2, 2);
    async.each(quitting, quit, done);

    function quit(node, cb) {
      node.close(cb);
    }
  });

  it('some time passes by...', {timeout: 4e3}, function(done) {
    setTimeout(done, 3e3);
  });

  it('... and the cluster still writes', function(done) {
    leader.put('a', 'b', done);
  });

  it('another node dies...', function(done) {
    nodes.shift().close(done);
  });

  it('some time passes by...', {timeout: 4e3}, function(done) {
    setTimeout(done, 3e3);
  });

  it('... and the cluster no longer writes', {timeout: 6e3}, function(done) {
    leader.put('c', 'd', {timeout: 3e3}, function(err) {
      assert.instanceOf(err, Error);
      assert(err.message.indexOf('timedout') > -1);
      done();
    });
  });

  it('if I revive a node...', function(done) {
    Client(
      'tcp+msgpack://localhost:8091',
      {
        dbPath: path.join(dbPath, 'node1'),
        standby: true
      }
    );
    done();
  });

  it('some time passes by...', {timeout: 4e3}, function(done) {
    setTimeout(done, 3e3);
  });

  it('... the cluster can write again', {timeout: 31e3}, function(done) {
    leader.put('c', 'd', {timeout: 30e3}, done);
  });

});
