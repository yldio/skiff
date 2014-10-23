# Skiff

[![Build Status](https://travis-ci.org/pgte/skiff.svg?branch=master)](https://travis-ci.org/pgte/skiff)
[![Dependency Status](https://david-dm.org/pgte/skiff.svg)](https://david-dm.org/pgte/skiff)

Node.js implementation of the Raft algorithm.

* Persistence: LevelDB
* Protocol: Msgpack over TCP

# Install

```bash
$ npm install skiff
```

# Create

```javascript
var Skiff = require('skiff');
var node = Skiff('tcp+msgpack://localhost:8081');
```

or, with options:

```javascript
var options {
  // ...
};

var node = Skiff('tcp+msgpack://localhost:8081', options);
```

## Options

* `autoListen`: start listening on bootup. defaults to `true`.
* `transport`: transport type. Supported values:
  * `tcp-msgpack`: Msgpack over TCP (default)
  * `tcp-nlsjson`: New-line separated JSON over TCP
* `dbPath`: database path
* `waitLeaderTimeout`: the time to wait to become a leader. defaults to 3000 (ms).
* `id`: id of the node. if not defined, it's self assigned. accessible on `node.id`
* `standby`: if true, will start at the `standby` state instead of the `follower` state. In the `standby` state the node only waits for a leader to send commands. Defaults to `false`.
* `cluster`: the id of the cluster this node will be a part of
* `uuid`: function that generates a UUID. Defaults to using the [`cuid`](https://github.com/ericelliott/cuid) package.
* `heartbeatInterval`: the interval between heartbeats sent from leader. defaults to 50 ms.
* `minElectionTimeout`: the minimum election timeout. defaults to 150 ms.
* `maxElectionTimeout`: the maximum election timeout. defaults to 300 ms.
* `commandTimeout`: the maximum amount of time you're willing to wait for a command to propagate. Defaults to 3 seconds. You can override this in each command call.
* `retainedLogEntries`: the maximum number of log entries that are committed to the state machine that should remain in memory. Defaults to 50.


# Use

A skiff client object implements [the level-up API](https://github.com/rvagg/node-levelup#api).

You can also extend the client with level-* plugins, including [sublevel](https://github.com/dominictarr/level-sublevel).

Other than that, you can:

## .listen(cb)

Listen for nodes connecting to us.

## .join(url, cb)

Joins a node given its URL.

## .leave(url, cb)

Leaves a node given its URL.

# Setting up a cluster

To boot a cluster, start a node and wait for it to become a leader. Then, create each additional node in the `standby` mode (`options.standby: true`) and do `leader.join(nodeURL)`.

See [this test](https://github.com/pgte/skiff/blob/master/tests/networking.js#L27) for an actual implementation.

# License

ISC