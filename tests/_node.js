'use strict';

var uuid = require('cuid');
var extend = require('xtend');

var NNode = require('../');
var transport = require('./_transport');
var Persistence = require('./_persistence');

module.exports = Node;

function Node(options) {
  var id = uuid();
  options = extend({}, {
    id:          id,
    transport:   transport,
    persistence: new Persistence(id)
  }, options);

  return NNode(options);
}