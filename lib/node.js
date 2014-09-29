'use strict';

var extend = require('xtend');
var Cluster = require('./cluster');
var inherits = require('util').inherits;
var EventEmitter = require('events').EventEmitter;
var defaultOptions = require('./default_node_options');

module.exports = Node;

function Node(options) {
  if (! (this instanceof Node)) return new Node(options);
  this.options = extend({}, defaultOptions, options);
  this.cluster = new Cluster(options);
  this.peers = [];
}

inherits(Node, EventEmitter);