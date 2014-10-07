'use strict';

var uuid = require('cuid');
var extend = require('xtend');

var NNode = require('../');
var Transport = require('./_transport2');
var persistence = require('./_persistence');

module.exports = Node;

function Node(options) {
  var id = uuid();
  options = extend({}, {
    id:          id,
    transport:   new Transport(id),
    persistence: persistence
  }, options);

  return NNode(options);
}
