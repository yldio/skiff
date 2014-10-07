var NodeC = require('./_node2');

module.exports = Cluster;

function Cluster(count) {
  var nodes = [];
  for(var i = 0 ; i < count ; i ++) {
    nodes.push(NodeC());
  }

  nodes.forEach(function(node) {
    nodes.forEach(function(node2) {
      if (node != node2) {
        node._join(node2.id);
      }
    });
  });

  return nodes;
}