const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'AI Calling SaaS API',
    version: '1.0.0',
    description: 'Production-Ready AI Calling SaaS Backend API documentation.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'v1 API server',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [
    {
      BearerAuth: [],
    },
  ],
  paths: {
    '/auth/register': {
      post: {
        summary: 'Register a new Merchant',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  businessName: { type: 'string' },
                  categoryId: { type: 'string', format: 'uuid' },
                },
                required: ['email', 'password', 'businessName', 'categoryId'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Merchant registered successfully' },
          400: { description: 'Validation or duplicate error' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate Merchant or Admin',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['merchant', 'super_admin'] },
                },
                required: ['email', 'password'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Authentication token returned' },
          401: { description: 'Invalid credentials' },
        },
      },
    },
    '/campaigns': {
      get: {
        summary: 'Get all merchant campaigns',
        responses: {
          200: { description: 'List of campaigns retrieved' },
        },
      },
      post: {
        summary: 'Create an outbound calling campaign',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  vobizNumberId: { type: 'string', format: 'uuid' },
                  agentId: { type: 'string', format: 'uuid' },
                  customerListId: { type: 'string', format: 'uuid' },
                  startTime: { type: 'string', format: 'date-time' },
                  intervalBetweenCalls: { type: 'integer', default: 5 },
                  maxConcurrentCalls: { type: 'integer', default: 1 },
                },
                required: ['name', 'vobizNumberId', 'agentId', 'customerListId', 'startTime'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Campaign draft created' },
        },
      },
    },
    '/campaigns/{id}/start': {
      post: {
        summary: 'Start outbound campaign calls',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Campaign started or scheduled' },
        },
      },
    },
    '/customers/upload': {
      post: {
        summary: 'Upload CSV customer list',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          200: { description: 'CSV import processed' },
        },
      },
    },
    '/analytics/campaign': {
      get: {
        summary: 'Get campaign call metrics',
        parameters: [
          {
            name: 'campaignId',
            in: 'query',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: {
          200: { description: 'Aggregated calling stats' },
        },
      },
    },
    '/analytics/leads': {
      get: {
        summary: 'Get lead status analytics',
        responses: {
          200: { description: 'Lead scores and outcome metrics' },
        },
      },
    },
    '/voices': {
      get: {
        summary: 'Get all available voices',
        responses: {
          200: { description: 'List of voices retrieved' },
        },
      },
    },
    '/voices/preview': {
      post: {
        summary: 'Generate and return a voice preview (cached on disk)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  voiceId: { type: 'string', description: 'Voice UUID or provider identifier' },
                  text: { type: 'string', description: 'Sample text to synthesize' },
                  language: { type: 'string', description: 'Locale code (e.g. en-IN, hi-IN)' },
                  pace: { type: 'number', minimum: 0.5, maximum: 2.0, default: 1.0 },
                  temperature: { type: 'number', minimum: 0.01, maximum: 2.0, default: 0.6 },
                },
                required: ['voiceId'],
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Binary audio stream',
            content: {
              'audio/wav': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
