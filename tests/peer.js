'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Peer = require('../lib/peer');
var transport = require('./_transport');
var sinon = require('sinon');
var uuid = require('cuid');

describe('peer', function() {

  it('can create a peer and retains options', function(done) {
    var options = uuid();
    var peer = Peer(options, {transport: transport});
    assert.equal(peer.id, options);
    done();
  });

  it('connects', function(done) {
    var options = uuid();
    var peer = Peer(options, {transport: transport});
    var spy = sinon.spy(transport, 'connect');
    peer.connect();
    assert.ok(spy.withArgs(options).calledOnce);
    done();
  });

  it('cannot send messages before connected', function(done) {
    var options = uuid();
    var peer = Peer(options, {transport: transport});
    peer.send('type', 'args', function(err) {
      assert.instanceOf(err, Error);
      done();
    });
  });

  it('can make remote calls', function(done) {
    var options = uuid();
    var peer = Peer(options, {transport: transport});
    var conn = peer.connect();
    var spy = sinon.spy(conn, 'send');
    peer.send('type', 'args', invoked);

    function invoked() {
      assert.ok(spy.called);
      assert.equal(spy.args[0][0], 'type');
      assert.equal(spy.args[0][1], 'args');
      assert.typeOf(spy.args[0][2], 'function');
      done();
    }
  });

  it('serializes remote calls', function(done) {
    var id = uuid();
    var peer = Peer(id, {transport: transport});
    transport.listen(id, listen);
    peer.connect();

    var active = true;
    var timeouts = [100, 0];

    peer.send('type', 'args', function(err) {
      if (err) {
        throw err;
      }
      active = false;
    });

    peer.send('type', 'args', function(err) {
      if (err) {
        throw err;
      }
      assert(!active);
      done();
    });

    function listen(type, args, cb) {
      assert.equal(type, 'type');
      assert.equal(args, 'args');
      setTimeout(cb, timeouts.shift());
    }
  });

  it('replies to remote calls', function(done) {
    var id = uuid();
    var peer = Peer(id, {transport: transport});
    transport.listen(id, listen);
    peer.connect();

    var replies = [
      [new Error('some error')],
      [null, 1],
      [null, 1, 2, 3]
    ];

    var c = 0;

    for (var i = 0 ; i < replies.length ; i ++) {
      checkReply(i);
    }

    function checkReply(i) {
      peer.send('type', 'args', function() {
        assert.deepEqual(Array.prototype.slice.call(arguments), replies[i]);
        if (i == replies.length - 1) {
          done();
        }
      });
    }

    function listen(type, args, cb) {
      cb.apply(null, replies[c ++]);
    }
  });

  it('does not call callbacks twice', function(done) {
    var id = uuid();
    var peer = Peer(id, {transport: transport});
    transport.listen(id, listen);
    peer.connect();

    peer.send('type', 'args', done);

    function listen(type, args, cb) {
      cb();
      cb();
    }
  });
});
