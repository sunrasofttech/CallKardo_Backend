const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/errorHandler');

// Route Imports
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const planRoutes = require('./routes/planRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const vobizRoutes = require('./routes/vobizRoutes');
const agentRoutes = require('./routes/agentRoutes');
const customerRoutes = require('./routes/customerRoutes');
const campaignRoutes = require('./routes/campaignRoutes');
const reportRoutes = require('./routes/reportRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const voiceRoutes = require('./routes/voiceRoutes');

// Swagger Spec
const swaggerSpec = require('./utils/swagger');

const path = require('path');

const app = express();

// 1. Security & Body Parsing Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled to allow Swagger UI CDN loading easily
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 2. Rate Limiting Middleware
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Max 15 attempts for registration/login
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply global limiter
app.use('/api/', globalLimiter);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

// 3. Swagger CDN UI Route (Premium Interactive Documentation)
app.get('/api-docs/json', (req, res) => {
  res.json(swaggerSpec);
});

app.get('/api-docs', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>AI Calling SaaS API Docs</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css" />
      <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin: 0; background: #fafafa; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-standalone-preset.min.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            url: "/api-docs/json",
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "BaseLayout"
          });
          window.ui = ui;
        };
      </script>
    </body>
    </html>
  `);
});

// 4. API v1 Routing
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/plans', planRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/vobiz', vobizRoutes);
app.use('/api/v1/agents', agentRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/campaigns', campaignRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/voices', voiceRoutes);

// 5. Global 404 Route
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Resource not found: ${req.method} ${req.url}`,
  });
});

// 6. Global Error Handler Middleware
app.use(errorHandler);

module.exports = app;
