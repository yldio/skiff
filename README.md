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

* `cluster`: the id of the cluster this node will be a part of
* `uuid`: function that generates a UUID. Defaults to using the [`cuid`](https://github.com/ericelliott/cuid) module.

## License

ISC

© Pedro Teixeira