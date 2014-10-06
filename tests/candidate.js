'use strict';

var Lab = require('lab');
var lab = exports.lab = Lab.script();
var describe = lab.describe;
var it = lab.it;
var assert = Lab.assert;

var uuid = require('cuid');
var NodeC = require('./_node');
var transport = require('./_transport');

describe('candidate', function() {

  it('reaches leader state if alone', function(done) {
    var node = NodeC();

    var states = ['follower', 'candidate', 'leader'];

    node.on('state', function(state) {
      if (states.length) {
        assert.equal(state, states.shift());
      }
      if (!states.length) {
        assert.equal(node.currentTerm(), 1);
        done();
      }
    });
  });

  it('doesnt reach leader if cannot get majority', function(done) {
    var node = NodeC();
    var remotes = [uuid(), uuid()];

    remotes.forEach(function(id) {
      node.join(id);
    });

    var states = ['follower', 'candidate', 'candidate'];

    node.on('state', function(state) {
      if (states.length) {
        assert.equal(state, states.shift());

        if (!states.length) {
          assert.equal(node.currentTerm(), 1);
          done();
        }
      }
    });
  });

  it('reaches leader if can get all the votes', function(done) {
    var node = NodeC();
    var remotes = [uuid(), uuid()];
    remotes.forEach(function(id) {
      transport.listen(id, listen);
      node.join(id);
    });

    var states = ['follower', 'candidate', 'leader'];

    node.on('state', function(state) {
      if (states.length) {
        assert.equal(state, states.shift());

        if (!states.length) {
          assert.equal(node.currentTerm(), 1);
          done();
        }
      }
    });

    var voteRequests = 0;

    function listen(type, args, cb) {
      if (type == 'RequestVote') {
        assert.equal(args.term, 1);
        assert.equal(args.lastLogIndex, 0);
        assert((++voteRequests) <= remotes.length);
        cb(null, {voteGranted: true});
      }
    }
  });

  it('reaches leader if can get majority of votes', function(done) {
    var node = NodeC();
    var remotes = [uuid(), uuid()];

    remotes.forEach(function(id, index) {
      transport.listen(remotes[index], listen(index));
      node.join(id);
    });

    var states = ['follower', 'candidate', 'leader'];

    node.on('state', function(state) {
      if (states.length) {
        assert.equal(state, states.shift());

        if (!states.length) {
          assert.equal(node.currentTerm(), 1);
          done();
        }
      }
    });

    function listen(index) {
      return function(type, args, cb) {
        if (type == 'RequestVote') {
          var reply = {
            voteGranted: (index === 0)
          };
          cb(null, reply);
        }
      };
    }
  });

  it('doesnt reach leader if candidate sends higher term', function(done) {
    var node = NodeC();
    var remotes = [uuid(), uuid()];

    remotes.forEach(function(id, index) {
      transport.listen(remotes[index], listen(id, index));
      node.join(id);
    });

    var states = ['follower', 'candidate', 'follower'];

    node.on('state', function(state) {
      if (states.length) {
        assert.equal(state, states.shift());

        if (!states.length) {
          assert.equal(node.currentTerm(), 2);
          done();
        }
      }
    });

    function listen(id, index) {
      return function(type, args, cb) {
        if (index >= 1) {
          setTimeout(function() {
            cb(null, {voteGranted: true});
          }, 100);
        } else {
          transport.invoke(id, 'AppendEntries', {term: node.currentTerm() + 1},
            function() {});
        }
      };
    }
  });

  it('reaches leader if other sends same term', function(done) {
    var node = NodeC();
    var remotes = [uuid(), uuid()];

    remotes.forEach(function(id, index) {
      transport.listen(remotes[index], listen(id, index));
      node.join(id);
    });

    var states = ['follower', 'candidate', 'leader'];

    node.on('state', function(state) {
      if (states.length) {
        assert.equal(state, states.shift());

        if (!states.length) {
          assert.equal(node.currentTerm(), 1);
          done();
        }
      }
    });

    function listen(id, index) {
      return function(type, args, cb) {
        if (index >= 1) {
          setTimeout(function() {
            cb(null, {voteGranted: true});
          }, 100);
        } else {
          transport.invoke(id, 'AppendEntries', {term: node.currentTerm()},
            function() {});
        }
      };
    }
  });
});
