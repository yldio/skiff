![Skiff](skiff.png)

# Skiff

[Raft](https://raft.github.io/) Consensus Algorithm implementation for Node.js.

* Persists to LevelDB (or any database exposing a [LevelDown](https://github.com/level/leveldown) interface).
* Encodes messages using Msgpack

## Installation

```bash
$ npm install skiff --save
```

## Usage

```javascript
const Levelup = require('levelup')
const Skiff = require('skiff')

const skiff = Skiff('/ip4/127.0.0.1/tcp/9490', options)
const db = Levelup()

skiff.start(err => {
  if (err) {
    console.error('Error starting skiff node: ', err.message)
  } else {
  console.log('Skiff node started')
}
})

```



## Node Options

* rpcTimeoutMs (number): maximum number of miliseconds to wait for until an RPC completes. Default = 5000
* db: database (LevelUp database): Optional