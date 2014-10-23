'use strict';

exports.resolve = function resolve(module) {
  if (typeof module == 'string') {
    module = require('skiff-' + module);
  }
  return module;
};
