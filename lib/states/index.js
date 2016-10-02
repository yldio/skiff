'use strict'

const stateModules = {
  follower: require('./follower'),
  candidate: require('./candidate'),
  leader: require('./leader'),
  weakened: require('./weakened')
}

function findState (stateName) {
  const State = stateModules[stateName]
  if (!State) {
    throw new Error('state not found: ' + stateName)
  }
  return State
}

module.exports = findState
