var NodeC = require('./_node2');

module.exports = Cluster;

function Cluster(count, cb) {
  var leader = NodeC();
  leader.listen(leader.id);
  count --;
  leader.once('leader', function() {
    var nodes = [];
    var node;
    for(var i = 0 ; i < count ; i ++) {
      var node = NodeC({standby: true});
      node.listen(node.id);
      leader.join(node.id)
      nodes.push(node);
    }
    if (cb) {
      cb(leader, nodes);
    }
  });

  return leader;
}