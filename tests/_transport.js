var Connection = require('./_connection');

exports.connect = connect;

function connect(options) {
  return new Connection(options);
}