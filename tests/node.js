'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;
var Node = require('../');

describe('node', function() {

  it('can create node with new and without options', function(done) {
    var node = Node();
    assert.instanceOf(node, Node);
    done();
  });

	it('can create node without new and with no options', function(done) {
    var node = Node();
    assert.instanceOf(node, Node);
    assert.typeOf(node.options, 'object');
    assert.typeOf(node.cluster, 'object');
    done();
	});
});