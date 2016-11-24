'use strict'

const commands = require('./commands')

const logCommand = {
  type: 'record',
  fields: [
    { name: 'type', type: ['null', 'string'], default: null },
    { name: 'key', type: ['null', 'string'], default: null },
    { name: 'value', type: ['null', 'string', 'long'], default: null },
    { name: 'peer', type: ['null', 'string'], default: null }
  ]
}

module.exports = {
  type: 'record',
  fields: [
    { name: 'term', type: ['null', 'long'], default: null },
    {
      name: 'replyTo',
      type: [
        'null',
        { name: 'Command', type: 'enum', symbols: commands }
      ],
      'default': null
    },
    {
      name: 'error',
      type: [
        'null',
        {
          type: 'record',
          fields: [
            { name: 'message', type: ['null', 'string'], default: null },
            { name: 'code', type: ['null', 'string'], default: null },
            { name: 'leader', type: ['null', 'string'], default: null }
          ]
        }
      ],
      'default': null
    },
    { name: 'leaderId', type: ['null', 'string'], default: null },
    { name: 'prevLogIndex', type: ['null', 'long'], default: null },
    { name: 'prevLogTerm', type: ['null', 'long'], default: null },
    { name: 'nextLogTerm', type: ['null', 'long'], default: null },
    { name: 'nextLogIndex', type: ['null', 'long'], default: null },
    { name: 'success', type: ['null', 'boolean'], default: null },
    { name: 'reason', type: ['null', 'string'], default: null },
    {
      name: 'entries',
      type: [
        'null',
        {
          type: 'array',
          items: {
            name: 'Entry',
            type: 'record',
            fields: [
              { name: 't', type: 'long' },
              { name: 'i', type: 'long' },
              {
                name: 'c',
                type: [
                  logCommand,
                  {
                    type: 'array',
                    items: logCommand
                  }
                ]
              }
            ]
          }
        }
      ],
      'default': null
    },
    {
      name: 'leaderCommit',
      type: ['null', 'long'],
      default: null
    },
    { name: 'candidateId', type: ['null', 'string'], default: null },
    { name: 'lastLogIndex', type: ['null', 'long'], default: null },
    { name: 'lastLogTerm', type: ['null', 'long'], default: null },
    { name: 'voteGranted', type: ['null', 'boolean'], default: null },
    { name: 'result', type: ['null', 'string', 'long'], default: null },
    {
      name: 'command',
      type: [
        'null',
        'string',
        {
          type: 'record',
          fields: [
            { name: 'type', type: ['null', 'string'], default: null },
            { name: 'key', type: ['null', 'string'], default: null },
            { name: 'value', type: ['null', 'string', 'long'], default: null },
            { name: 'peer', type: ['null', 'string'], default: null }
          ]
        }
      ],
      default: null
    },
    {
      name: 'options',
      type: [
        'null',
        {
          type: 'record',
          fields: [
            { name: 'tries', type: ['null', 'long'], default: null },
            { name: 'remote', type: ['null', 'boolean'], default: null },
            { name: 'alsoWaitFor', type: ['null', 'string'], default: null },
            { name: 'asBuffer', type: ['null', 'boolean'], default: null }
          ]
        }
      ],
      default: null
    },

    // InstallSnapshot
    {
      name: 'data',
      type: [
        'null',
        {
          type: 'array',
          items: {
            type: 'record',
            fields: [
              { name: 'type', type: ['null', 'string'], default: null },
              { name: 'key', type: ['null', 'string'], default: null },
              { name: 'value', type: ['null', 'string', 'long'], default: null },
              { name: 'peer', type: ['null', 'string'], default: null }
            ]
          }
        }
      ],
      default: null
    },
    { name: 'offset', type: ['null', 'long'], default: null },
    { name: 'lastIncludedTerm', type: ['null', 'long'], default: null },
    { name: 'lastIncludedIndex', type: ['null', 'long'], default: null },
    { name: 'done', type: ['null', 'boolean'], default: null },
    {
      name: 'peers',
      type: [
        'null',
        {
          type: 'array',
          items: ['null', 'string']
        }
      ],
      default: null
    }
  ]
}
