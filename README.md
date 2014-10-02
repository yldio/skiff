# Raft

Node.js implementation of the [Raft Consensus Algorithm](http://raftconsensus.github.io/).

## Install

```bash
$ node install node-raft --save
```

## Require

```javascript
var Node = require('node-raft');
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
* `cluster`: the id of the cluster this node will be a part of
* `transport`: the transport to communicate with peers. See the [transport API](#transport)
* `persistence`: the node persistence layer. See the [persistence API](#persistence)
* `uuid`: function that generates a UUID. Defaults to using the [`cuid`](https://github.com/ericelliott/cuid) module.

### Node API

#### .join()

Joins a peer.

```javascript
node.join(peer);
```

The peer is an object describing the peer. The description depends on the transport you're using.

#### .peers

An array containing all the known peers.


### Transport API

The node transport option accepts an object that implements the following interface:

* `connect(options)` — for connecting to the peer. returns a connection object

#### Connection API

The connection API implements the following interface:

* `invoke(type, arguments, callback)` — for making a remote call into the peer. The `callback` argument is a function with the signature `function (err, result)`.
* `listen(callback)` — listen for messages from the remote peer. The `callback` argument is a function with the signature `function (type, args, cb)`. `cb` is a function that accepts the reply arguments.
* `close(callback)` — for closing the connection. The `callback` argument is a function with the signature `function (err)`.


### Persistence API

The node persistence option accepts an object that implements the following interface:

* `saveMeta(nodeId, state, callback)` — saves the raft engine metadata. `nodeId` is a string that represents the current node. `state` is an arbitrary object (hash map) and `callback` is a function with the signature `function callback(err)`;
* `loadMeta(nodeId, callback)` — loads the engine metadata state. `callback` is a function with the signature `function callback(err, state)`;
* `applyLog(nodeId, commitIndex, log, callback)` - applies a log entry to the node state machine.
  * Persistence layer should save the commitIndex if it wants to make sure that log entries are not repeated.
  * Saving this should be atomic: the `commitIndex` and the log application to the state machine should be successful or fail entirely.
  * If the commitIndex has already been applied in the past, just callback with success.
  `callback` is a function with the following signature: `function callback(err)`.
* `lastAppliedCommitIndex(nodeId, callback)` - returns the last `commitIndex` that was successfully applied to the node state machine.
  * is asynchronous: `callback` is a function invoked once the result is ready
  * `callback` is a function with the following signature: `function(err, commitIndex)` - if operation resulted in error, `err` contains an error object. Otherwise, `commitIndex` may contain an integer with the index of the latest applied `commitIndex` if there was one.


## License

ISC

© Pedro Teixeira