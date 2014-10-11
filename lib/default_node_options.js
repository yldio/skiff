module.exports = {
  standby: false,
  minElectionTimeout: 150,
  maxElectionTimeout: 300,
  heartbeatInterval: 50,
  uuid: require('cuid'),
  commandTimeout: 2e3
};
