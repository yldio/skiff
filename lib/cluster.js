'use strict';

var extend = require('xtend');
var defaultOptions = require('./default_cluster_options');

module.exports = Cluster;

function Cluster(options) {
  this.options = options = extend({}, defaultOptions, options);
  this.id = options.cluster || options.uuid();
}
