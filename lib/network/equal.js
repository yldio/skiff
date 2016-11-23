'use strict'

module.exports = function equal (a, b) {
  let i
  if (a === b) {
    return true
  }

  if (isUndefinedOrNull(a) && isUndefinedOrNull(b)) {
    return true
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      console.log('array length')
      return false
    }
    for (i = 0; i < a.length; i++) {
      if (!equal(a[i], b[i])) {
        console.log('array entry %d', i)
        return false
      }
    }

    return true
  }

  const ka = Object.keys(a)
  const kb = Object.keys(b)

  for (i = ka.length - 1; i >= 0; i--) {
    if (!isUndefinedOrNull(a[ka[i]]) && kb.indexOf(ka[i]) < 0) {
      console.log('key %s', ka[i])
      return false
    }
  }

  let key

  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i]
    if (!equal(a[key], b[key])) return false
  }

  return true
}

function isUndefinedOrNull (value) {
  return value === null || value === undefined
}
