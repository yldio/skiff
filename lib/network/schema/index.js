'use strict'

const avro = require('avsc')
const commands = require('./commands')
const Params = require('./params')

const schema = {
  name: 'Message',
  type: 'record',
  fields: [
    { name: 'id', type: ['null', 'string'], default: null },
    { name: 'from', type: ['null', 'string'], default: null },
    { name: 'to', type: ['null', 'string'], default: null },
    {
      name: 'type',
      type: [
        'null',
        {
          type: 'enum',
          symbols: [
            'request',
            'reply',
            'broadcast'
          ]
        }
      ],
      default: null
    },
    {
      name: 'action',
      type: ['null', { type: 'enum', symbols: commands }],
      default: null
    },
    {
      name: 'params',
      type: ['null', Params],
      default: null
    }
  ]
}

module.exports = avro.parse(schema)
