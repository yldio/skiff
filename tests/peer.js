'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Peer = require('../lib/peer');
var transport = require('./_transport');
var sinon = require('sinon');

describe('peer', function() {

  it('can create a peer and retains options', function(done) {
    var options = {what: 'evs'};
    var peer = Peer(options, {transport: transport});
    assert.equal(peer.options, options);
    done();
  });

  it('connects', function(done) {
    var options = {what: 'evs'};
    var peer = Peer(options, {transport: transport});
    var spy = sinon.spy(transport, 'connect');
    peer.connect();
    assert.ok(spy.withArgs(options).calledOnce);
    done();
  });

});