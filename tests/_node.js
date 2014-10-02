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

  return NNode(options);
}