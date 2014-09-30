'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Node = require('./_node');

describe('cluster', function() {

  it('cluster has id if you provide it with one', function(done) {
    var node = Node({cluster: 'SOMECLUSTERID'});
    var cluster = node.cluster;
    assert.equal(cluster.id, 'SOMECLUSTERID');
    done();
  });

  it('cluster has id if you don\'t provide it with one', function(done) {
    var node = Node();
    var cluster = node.cluster;
    assert.typeOf(cluster.id, 'string');
    done();
  });

});