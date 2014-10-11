'use strict';

var uuid = require('cuid');
var extend = require('xtend');

var NNode = require('../');
var transport = require('./_transport');
var persistence = require('./_persistence');

module.exports = Node;

function Node(options) {
  var id = uuid();
  options = extend({}, {
    id:          id,
    transport:   transport,
    persistence: persistence
  }, options);

  var node = NNode(options);

  node.once('stopped', onceStopped);
  function onceStopped() {
    node.on('error', function(err) {
      console.error(err);
    });
  }

  return node;
}
