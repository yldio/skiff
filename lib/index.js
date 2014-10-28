'use strict';

var SkiffNode = require('skiff-algorithm');
var SkiffLevel = require('skiff-level');

var once = require('once');
var ltgt = require('ltgt');
var async = require('async');
var extend = require('xtend');
var msgpack = require('msgpack5')();
var inherits = require('util').inherits;
var propagate = require('propagate');
var transports = require('./transports');
var EventEmitter = require('events').EventEmitter;
var defaultOptions = require('./default_options');
var WriteStream = require('./write_stream');

// murdering kittens:
var codec;
try {
  codec = require(
  'skiff-level/node_modules/level-sublevel/node_modules/levelup/lib/codec');
} catch (error) {
  codec = require('level-sublevel/node_modules/levelup/lib/codec');
}

var precodec = require('./precodec');

var beforeLeaderOps = ['listen', 'waitLeader', 'close'];

module.exports = SkiffClient;

function SkiffClient(id, options) {
  if (!(this instanceof SkiffClient)) {
    return new SkiffClient(id, options);
  }

  var self = this;

  if (!id) {
    throw new Error('need id');
  }
  this.id = id;

  EventEmitter.call(this);
  this._options = extend({}, defaultOptions, options);
  this._db = new SkiffLevel(this._options.dbPath);
  this._options.id = id;
  this._options.persistence = this._db;
  this._options.transport = new (transports.resolve(this._options.transport))();
  this.node = new SkiffNode(this._options);

  propagate(this.node, this);
  this.node.on('error', function(err) {
    self.emit('error', err);
  });

  // propagate certain persistence layer events
  this._options.persistence.on('error', function(err) {
    self.emit('error', err);
  });

  // propagate certain transport layer events
  this._options.transport.on('error', function(err) {
    self.emit('error', err);
  });

  // queue
  this.queue = async.queue(work, 1);

  if (this._options.autoListen) {
    this.queue.push({op: 'listen', args: [listening]});
  }

  function listening(err) {
    if (err) {
      self.emit('error', err);
    }
  }

  this.queue.push({
    op: 'waitLeader'
  });

  function work(item, cb) {
    var method = '_' + item.op;
    var args = item.args || [];
    var appCallback = args[args.length - 1];
    var typeofAppCallback = typeof appCallback;
    if (typeofAppCallback == 'function' || typeofAppCallback == 'undefined') {
      args.pop();
    } else {
      appCallback = undefined;
    }

    if (beforeLeaderOps.indexOf(item.op) == -1 &&
        self.node.state.name != 'leader') {
      var err = new Error(item.op + ' operation requires being the leader');
      err.leader = self.node.currentLeader();
      callback(err);
    } else {
      args.push(callback);
      self[method].apply(self, args);
    }

    function callback() {
      if (appCallback) {
        appCallback.apply(null, arguments);
      }
      cb();
    }
  }
}

inherits(SkiffClient, EventEmitter);

var SC = SkiffClient.prototype;

/// Public

SC.put = function put(key, value, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }

  this.queue.push({
    op: 'put',
    args: [key, value, options, cb]
  });
};

SC.del = function get(key, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }

  this.queue.push({
    op: 'del',
    args: [key, options, cb]
  });
};

SC.batch = function batch(ops, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }

  this.queue.push({
    op: 'batch',
    args: [ops, options, cb]
  });
};

SC.get = function _get(key, options, cb) {
  if (typeof options == 'function') {
    cb = options;
    options = undefined;
  }

  var sublevels = this._db._nodeSublevels(this.node.id);
  if (!sublevels) {
    var error = new Error('Key not found');
    error.notFound = true;
    cb(error);
  } else {
    sublevels.state.get(key, options, cb);
  }
};

SC.createReadStream = function createReadStream(options) {
  return this._db._nodeSublevels(this.node.id).state.createReadStream(options);
};

SC.iterator = function iterator(options) {
  var opts = extend({}, options, {valueAsBuffer: true});
  var prefix = this._db._nodeSublevels(this.node.id).state.prefix();
  ltgt.toLtgt(options, opts, encodeKey);

  return wrapIterator(this._db._main.db.iterator(opts));

  function encodeKey(key) {
    return encodePrefix(prefix, key, opts, {});
  }

  function encodePrefix(prefix, key, opts1, opts2) {
    return precodec.encode([prefix, codec.encodeKey(key, opts1, opts2)]);
  }

  function wrapIterator(iterator) {
    return {
      next: function(cb) {
        iterator.next(function(err, key, value) {
          if (key) {
            key = precodec.decode(key)[1];
          }
          if (value) {
            value = msgpack.decode(value);
          }
          cb(err, key, value);
        });
      },
      end: function end(cb) {
        iterator.end(cb);
      }
    };
  }
};

SC.createWriteStream = function createWriteStream(options) {
  return new WriteStream(this, options);
};

SC.join = function join(node, metadata, cb) {
  if (typeof metadata == 'function') {
    cb = metadata;
    metadata = null;
  }
  this.node.join(node, metadata, cb);
};

SC.peerMeta = function peerMeta(node) {
  return this.node.peerMeta(node);
};

SC.listen = function listen(cb) {
  var self;
  this.node.listen(this.node.id, listening);

  function listening(err) {
    if (err) {
      if (cb) {
        cb(err);
      }
      else {
        self.emit('error', err);
      }
    }
    else {
      cb();
    }
  }
};

SC.close = function close(cb) {
  this.queue.push({
    op: 'close',
    args: [cb]
  });
};

SC.open = function open(cb) {
  this._waitLeader(cb);
};

/// Private

SC._listen = function _listen(cb) {
  this.listen(cb);
};

SC._waitLeader = function _waitLeader(cb) {
  cb = once(cb);

  if (this.node.state.name == 'leader' || this._options.standby) {
    cb();
  } else {
    setTimeout(cb, this._options.waitLeaderTimeout);
    this.node.once('leader', cb);
  }
};

SC._put = function _put(key, value, options, cb) {
  this.node.command({
    type: 'put',
    key: key,
    value: value
  }, options, cb);
};

SC._del = function _del(key, options, cb) {
  this.node.command({
    type: 'del',
    key: key
  }, options, cb);
};

SC._batch = function _batch(operations, options, cb) {
  this.node.command({
    type: 'batch',
    operations: operations,
    options: options
  }, options, cb);
};

SC._close = function _close(cb) {
  var self = this;

  this.node.close(closedNode);

  function closedNode(err) {
    if (err) {
      cb(err);
    } else {
      self._db.close(cb);
    }
  }
};
