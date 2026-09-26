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
        summary: 'Register a new Merchant (OTP based, password not required)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  mobile: { type: 'string' },
                  password: { type: 'string', description: 'Optional: kept for future use' },
                },
                required: ['mobile'],
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP sent successfully for registration' },
          400: { description: 'Validation or duplicate error' },
        },
      },
    },
    '/auth/register-with-business': {
      post: {
        summary: 'Register a new Merchant with Business Setup details (OTP based, password not required)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  mobile: { type: 'string', example: '9876543210' },
                  password: { type: 'string', minLength: 6, example: 'Password123', description: 'Optional: kept for future use' },
                  email: { type: 'string', format: 'email', example: 'merchant@example.com' },
                  businessName: { type: 'string', example: 'Apex Logistics' },
                  business_type: { type: 'string', enum: ['individual', 'proprietorship', 'private_limited', 'llp', 'partnership', 'public_limited', 'trust', 'society', 'huf', 'government'], example: 'private_limited' },
                  categoryId: { type: 'string', format: 'uuid', example: '123e4567-e89b-12d3-a456-426614174000' },
                  businessUrl: { type: 'string', format: 'uri', example: 'https://apexlogistics.com' },
                  fcmToken: { type: 'string' },
                  intrestinourproduct: { type: 'boolean', default: true },
                },
                required: ['mobile', 'businessName', 'business_type', 'categoryId'],
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP sent successfully for registration' },
          400: { description: 'Validation or duplicate error' },
        },
      },
    },
    '/auth/setup-business': {
      post: {
        summary: 'Setup Merchant Business Details',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string' },
                  businessName: { type: 'string' },
                  businessUrl: { type: 'string' },
                  business_type: { type: 'string', enum: ['individual', 'proprietorship', 'private_limited', 'llp', 'partnership', 'public_limited', 'trust', 'society', 'huf', 'government'] },
                  categoryId: { type: 'string', format: 'uuid' },
                },
                required: ['businessName', 'categoryId', 'business_type'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Business details saved successfully' },
          400: { description: 'Validation or duplicate error' },
        },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate Merchant (OTP only) or Admin (Password/OTP)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  mobile: { type: 'string', example: '9876543210' },
                  email: { type: 'string', example: 'merchant@example.com' },
                  otp: { type: 'string', minLength: 6, maxLength: 6, example: '123456' },
                  password: { type: 'string', description: 'Required for super_admin, not used for merchant users' },
                  role: { type: 'string', enum: ['merchant', 'super_admin'], default: 'merchant' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'OTP sent (if no OTP provided) or authentication tokens returned (if OTP provided)' },
          401: { description: 'Invalid credentials or user not found' },
        },
      },
    },
    '/auth/merchant/reset-password': {
      post: {
        summary: 'Direct Password Reset for Authenticated Merchant (no old password required)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  password: { type: 'string', minLength: 6 },
                  confirmPassword: { type: 'string', minLength: 6 },
                },
                required: ['password', 'confirmPassword'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Merchant password updated successfully' },
          400: { description: 'Validation error or password mismatch' },
          401: { description: 'Unauthorized token missing or invalid' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get current authenticated user profile',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'User profile retrieved successfully' },
          401: { description: 'Unauthorized' },
        },
      },
      delete: {
        summary: 'Delete current authenticated user account',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'Account permanently deleted' },
          401: { description: 'Unauthorized' },
        },
      },
    },
    '/vobiz/kyc/generate-session': {
      post: {
        summary: 'Generate a Vobiz KYC session (Email Flow)',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'KYC session generated and email sent' },
          400: { description: 'Error generating session' },
        },
      },
    },
    '/vobiz/kyc/status': {
      get: {
        summary: 'Get latest KYC verification status from Vobiz',
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: 'KYC status retrieved' },
          404: { description: 'Sub-account not found' },
        },
      },
    },
    '/vobiz/kyc/webhook': {
      post: {
        summary: 'Vobiz KYC Status Webhook',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
        responses: {
          200: { description: 'Webhook received successfully' },
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
    '/admin/subscriptions': {
      get: {
        summary: 'Get all merchant subscriptions with pagination, filtering and search (Admin)',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'expired', 'cancelled'] } },
          { name: 'planId', in: 'query', schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Paginated list of subscriptions retrieved successfully' },
          401: { description: 'Unauthorized' },
          403: { description: 'Forbidden (Admin only)' },
        },
      },
    },
    '/admin/subscriptions/upgrade': {
      post: {
        summary: 'Upgrade a merchant subscription (Admin)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  merchantId: { type: 'string', format: 'uuid' },
                  subscriptionId: { type: 'string', format: 'uuid' },
                  planId: { type: 'string', format: 'uuid' },
                  customCallLimit: { type: 'integer' },
                  durationMonths: { type: 'integer', default: 1 },
                  expiryDate: { type: 'string', format: 'date-time' },
                  status: { type: 'string', enum: ['active', 'expired', 'cancelled'], default: 'active' },
                },
                required: ['planId'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Subscription upgraded successfully' },
          404: { description: 'Merchant or Plan not found' },
        },
      },
    },
    '/admin/subscriptions/{id}': {
      get: {
        summary: 'Get subscription by ID or merchant ID (Admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Subscription details retrieved' },
          404: { description: 'Subscription not found' },
        },
      },
      put: {
        summary: 'Update subscription details (Admin override)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  planId: { type: 'string', format: 'uuid' },
                  callsRemaining: { type: 'integer' },
                  callsUsed: { type: 'integer' },
                  expiryDate: { type: 'string', format: 'date-time' },
                  status: { type: 'string', enum: ['active', 'expired', 'cancelled'] },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Subscription updated successfully' },
        },
      },
    },
    '/admin/merchants/{id}/subscription/upgrade': {
      post: {
        summary: 'Upgrade subscription for a specific merchant (Admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  planId: { type: 'string', format: 'uuid' },
                  customCallLimit: { type: 'integer' },
                  durationMonths: { type: 'integer' },
                },
                required: ['planId'],
              },
            },
          },
        },
        responses: {
          200: { description: 'Merchant subscription upgraded' },
        },
      },
    },
    '/admin/categories': {
      get: {
        summary: 'Get all business categories (Admin)',
        responses: {
          200: { description: 'Categories list retrieved' },
        },
      },
      post: {
        summary: 'Create a new business category (Admin)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  defaultPrompt: { type: 'string' },
                  defaultVoiceId: { type: 'string', format: 'uuid' },
                  defaultLanguage: { type: 'string' },
                  defaultAgentConfig: { type: 'object' },
                },
                required: ['name', 'defaultPrompt'],
              },
            },
          },
        },
        responses: {
          201: { description: 'Business category created' },
        },
      },
    },
    '/admin/categories/{id}': {
      get: {
        summary: 'Get business category by ID (Admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Category details retrieved' },
          404: { description: 'Category not found' },
        },
      },
      put: {
        summary: 'Update business category (Admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  defaultPrompt: { type: 'string' },
                  defaultVoiceId: { type: 'string', format: 'uuid' },
                  defaultLanguage: { type: 'string' },
                  defaultAgentConfig: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Category updated successfully' },
        },
      },
      delete: {
        summary: 'Delete business category (Admin)',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          200: { description: 'Category deleted successfully' },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
