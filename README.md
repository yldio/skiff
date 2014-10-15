# Skiff

[![Build Status](https://travis-ci.org/pgte/skiff.svg)](https://travis-ci.org/pgte/skiff)
[![Dependencies] (https://david-dm.org/pgte/skiff.png)](https://david-dm.org/pgte/skiff)
[![Gitter](https://badges.gitter.im/Join Chat.svg)](https://gitter.im/pgte/skiff?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

Node.js implementation of the [Raft Consensus Algorithm](http://raftconsensus.github.io/).

Contents:

* [Install](#install)
* [Require](#require)
* [Create a node](#create-a-node)
* [Node API](#node-api)
* [Plugins](#plugins)
* [Cluster setup](#cluster-setup)
* [License](#license)

## Install

```bash
$ node install skiff --save
```

## Require

```javascript
var Node = require('skiff');
```

## Create a node

```javascript
var node = Node();
```

or, with options:

```javascript
options = {
  // ...
};
var node = Node(options);
```

### Node create options

* `id`: id of the node. if not defined, it's self assigned. accessible on `node.id`
* `standby`: if true, will start at the `standby` state instead of the `follower` state. In the `standby` state the node only waits for a leader to send commands. Defaults to `false`.
* `cluster`: the id of the cluster this node will be a part of
* `transport`: the transport to communicate with peers. See the [transport API](#transport-provider-api)
* `persistence`: the node persistence layer. See the [persistence API](#persistence-provider-api)
* `uuid`: function that generates a UUID. Defaults to using the [`cuid`](https://github.com/ericelliott/cuid) package.
* `heartbeatInterval`: the interval between heartbeats sent from leader. defaults to 50 ms.
* `minElectionTimeout`: the minimum election timeout. defaults to 150 ms.
* `maxElectionTimeout`: the maximum election timeout. defaults to 300 ms.
* `commandTimeout`: the maximum amount of time you're willing to wait for a command to propagate. Defaults to 2 seconds. You can ovverride this in each command call.
* `retainedLogEntries`: the maximum number of log entries that are committed to the state machine that should remain in memory. Defaults to 50.


## Node API

### .listen(options, listener)

Makes the peer listen for peer communications. Takes the following arguments:

* `options` - connection options, depends on the transport provider being used.
* `listener` - a function with the following signature: `function (peerId, connection)`. The arguments for the listener function are:
  * `peerId` - the identification of the peer
  * `connection` - a connection with the peer, an object implementing the Connection API (see below).

### .join(peer, cb)

Joins a peer into the cluster.

```javascript
node.join(peer, cb);
```

The peer is a string describing the peer. The description depends on the transport you're using.

### .leave(peer, cb)

Removes a peer from the cluster,

```javascript
node.leave(peer, cb);
```

The peer is a string describing the peer. The description depends on the transport you're using.

### .peers

An array containing all the known peers.


### .command(command[, options], callback)

Appends a command to the leader log. If node is not the leader, callback gets invoked with an error. Example:

```javascript
node.command('some command', function(err) {
  if (err) {
    if (err.code == 'ENOTLEADER') {
       // redirect client to err.leader
    }
  } else {
    console.log('cluster agreed on this command');
  }
});
```

This command times out after the `options.commandTimeout` passes by, but you can override this by passing in some options:

```javascript
node.command('some command', {timeout: 5000}, function(err) {
  if (err) {
    if (err.code == 'ENOTLEADER') {
       // redirect client to err.leader
    }
  } else {
    console.log('cluster agreed on this command');
  }
});
```


### Events

A node emits the following events that may or not be interesting to you:

* `error(error)` - when an unexpected error occurs.
* `state(stateName)` - when a new state transition occurs. Possible values for `stateName` are: `idle`, `follower`, `candidate`, `leader`.
* `loaded()` - when a node has loaded configuration from persistence provider.
* `election timeout()` - when an election timeout occurs.
* `applied log(logIndex)` - when a node applies a log entry to the state machine


## Plugins

Skiff if failry high-level and doesn't implement the network transport or the persistence layers. Instead, you have to provide an implementation for these.

### Transport provider API

The node `transport` option accepts a provider object that implements the following interface:

* `connect(options)` — for connecting to the peer. returns a connection object
* `listen(options, fn)` — for listening to incoming connection requests. The `fn` argument is a function with the signaure `function (peerId, connection)` that gets invoked when there is a connection request, passing in a connection object that implements the Connection API (see below).

#### Connection API

The connection API implements the following interface:

* `send(type, arguments, callback)` — for making a remote call into the peer. The `callback` argument is a function with the signature `function (err, result)`.
* `receive(fn)` — listen for messages from the remote peer. The `fn` argument is a function with the signature `function (type, args, cb)`. `cb` is a function that accepts the reply arguments.
* `close(callback)` — for closing the connection. The `callback` argument is a function with the signature `function (err)`.

The connection object is an EventEmitter, emitting the following events:

* `close` - once the connection closes

### Persistence provider API

The node `persistence` option accepts a provider object that implements the following interface:

* `saveMeta(nodeId, state, callback)` — saves the raft engine metadata. `nodeId` is a string that represents the current node. `state` is an arbitrary object (hash map) and `callback` is a function with the signature `function callback(err)`;
* `loadMeta(nodeId, callback)` — loads the engine metadata state. `callback` is a function with the signature `function callback(err, state)`;
* `applyLog(nodeId, commitIndex, logEntry, callback)` - applies a log entry to the node state machine.
  * Persistence layer should save the commitIndex if it wants to make sure that log entries are not repeated.
  * Saving this should be atomic: the `commitIndex` and the log application to the state machine should be successful or fail entirely.
  * If the commitIndex has already been applied in the past, just callback with success.
  `callback` is a function with the following signature: `function callback(err)`.
* `lastAppliedCommitIndex(nodeId, callback)` - returns the last `commitIndex` that was successfully applied to the node state machine.
  * is asynchronous: `callback` is a function invoked once the result is ready
  * `callback` is a function with the following signature: `function(err, commitIndex)` - if operation resulted in error, `err` contains an error object. Otherwise, `commitIndex` may contain an integer with the index of the latest applied `commitIndex` if there was one.
* `saveCommitIndex(nodeId, commitIndex, callback)`  - saves only the commit index
* `createReadStream(nodeId)` - returns a read stream that streams all the state machine data.
* `createWriteStream(nodeId)` - resets the state machine and returns a write stream to overwrite all the state machine data.

## Cluster Setup

Setting up a Skiff cluster can be kind of tricky. To avoid partitions you will need to start with a node that will become leader and then add the followers in the standby mode. Mind you that you can only send `join` commands to a leader node (to avoid partitions — it's all explained in detail in the Raft paper). Once this is done and persisted you should never need to do this again since the nodes will know each other and elect a leader at random if leader goes down.


So typically the bootstrap code for the leader would be something like:

```javascript
var Node = require('skiff');
var leader = Node({
  transport: transport,
  persistence: persistence
});

leader.listen(address);

/// wait for the leader node to actually become a leader of it's one node
leader.once('leader', function() {
  leader.join('node1');
  leader.join('node2');
});

leader.on('joined', function(peer) {
  console.log('leader joined %s', peer.id);
});
```

The follower bootstrapping code would look something like this:

```javascript
var Node = require('skiff');
var node = Node({
  transport: transport,
  persistence: persistence,
  standby: true // important
});

node.listen(address);
```

This makes the follower start in the standby mode.

As mentioned, once the cluster enters stationary mode you just need to bootstrap all the nodes in the same way:

```javascript
var Node = require('skiff');
var node = Node({
  transport: transport,
  persistence: persistence,
});

node.listen(address);
```


## License

ISC

© Pedro Teixeira