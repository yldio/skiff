'use strict';

var inherits = require('util').inherits;
var BatchWriteStream = require('batch-write-stream');

module.exports = WriteStream;

function WriteStream(client, options) {
  BatchWriteStream.call(this, options);
  this.client = client;
}

inherits(WriteStream, BatchWriteStream);

var WS = WriteStream.prototype;

WS._writeBatch = function(batch, cb) {
  this.client.batch(batch, cb);
};
