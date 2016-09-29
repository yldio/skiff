M = require('./lib/multiaddr')
m = M('/ip4/127.0.0.1/tcp/123/user/abc')
console.log(m.toString())
