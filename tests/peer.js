'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Peer = require('../lib/peer');

describe('peer', function() {

  it('can create a peer and retains options', function(done) {
    var options = {what: 'evs'};
    var peer = Peer(options);
    assert.equal(peer.options, options);
    done();
  });

});