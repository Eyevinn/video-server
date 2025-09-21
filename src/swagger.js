const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Open Video Server API',
      version: '1.0.0',
      description: 'Professional video streaming server with queue management, multiple output protocols, and slate generation',
      contact: {
        name: 'Eyevinn Technology',
        url: 'https://www.eyevinn.se'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: '/api',
        description: 'API Server'
      }
    ],
    tags: [
      {
        name: 'Status',
        description: 'Server and system status endpoints'
      },
      {
        name: 'Queue',
        description: 'Video queue management'
      },
      {
        name: 'Stream',
        description: 'Stream control operations'
      },
      {
        name: 'Configuration',
        description: 'Server configuration'
      },
      {
        name: 'Preview',
        description: 'Live preview functionality'
      }
    ],
    components: {
      schemas: {
        QueueItem: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier for the queue item'
            },
            url: {
              type: 'string',
              format: 'uri',
              description: 'URL of the video content'
            },
            title: {
              type: 'string',
              description: 'Title of the video content'
            },
            duration: {
              type: 'integer',
              description: 'Duration in seconds'
            },
            addedAt: {
              type: 'string',
              format: 'date-time',
              description: 'When the item was added to the queue'
            },
            status: {
              type: 'string',
              enum: ['queued', 'playing', 'finished'],
              description: 'Current status of the queue item'
            }
          }
        },
        StreamStatus: {
          type: 'object',
          properties: {
            isStreaming: {
              type: 'boolean',
              description: 'Whether a stream is currently active'
            },
            currentItem: {
              $ref: '#/components/schemas/QueueItem',
              nullable: true
            },
            outputConfig: {
              type: 'object',
              description: 'Current streaming configuration'
            },
            restartAttempts: {
              type: 'integer',
              description: 'Number of restart attempts for current stream'
            }
          }
        },
        ServerStatus: {
          type: 'object',
          properties: {
            uptime: {
              type: 'number',
              description: 'Server uptime in seconds'
            },
            memory: {
              type: 'object',
              description: 'Memory usage statistics'
            },
            version: {
              type: 'string',
              description: 'Server version'
            }
          }
        },
        QueueStatus: {
          type: 'object',
          properties: {
            isPlaying: {
              type: 'boolean',
              description: 'Whether queue is currently playing content'
            },
            currentItem: {
              $ref: '#/components/schemas/QueueItem',
              nullable: true
            },
            nextItem: {
              $ref: '#/components/schemas/QueueItem',
              nullable: true
            },
            queueLength: {
              type: 'integer',
              description: 'Number of items in queue'
            },
            totalItems: {
              type: 'integer',
              description: 'Total items including currently playing'
            }
          }
        },
        SlateStatus: {
          type: 'object',
          properties: {
            isActive: {
              type: 'boolean',
              description: 'Whether slate is currently being generated'
            },
            enabled: {
              type: 'boolean',
              description: 'Whether slate generation is enabled'
            },
            isGenerating: {
              type: 'boolean',
              description: 'Whether slate FFmpeg process is running'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            error: {
              type: 'string',
              description: 'Error message'
            }
          }
        },
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              description: 'Response data'
            }
          }
        }
      }
    }
  },
  apis: ['./src/api.js']
};

const specs = swaggerJSDoc(options);

module.exports = {
  specs,
  swaggerUi
};