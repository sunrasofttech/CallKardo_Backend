require('dotenv').config();

module.exports = {
  // Server Configuration
  get port() {
    return parseInt(process.env.PORT || '3000', 10);
  },
  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  },

  // WebSocket Server Configuration
  ws: {
    get port() {
      return parseInt(process.env.WS_PORT || process.env.PORT || '3000', 10);
    },
    get host() {
      return process.env.WS_HOST || `127.0.0.1:${this.port}`;
    },
  },

  // Gemini Configuration
  gemini: {
    get apiKey() {
      return process.env.GEMINI_API_KEY;
    },
    get analysisModel() {
      return process.env.GEMINI_ANALYSIS_MODEL || 'gemini-3.5-flash';
    },
    get liveModel() {
      return process.env.GEMINI_LIVE_MODEL || 'gemini-3.5-flash';
    },
    get multimodalLiveModel() {
      return process.env.GEMINI_MULTIMODAL_LIVE_MODEL || 'gemini-3.1-flash-live-preview';
    },
  },



  // Sarvam Service Configuration
  sarvam: {
    get apiKey() {
      return process.env.SARVAM_API_KEY;
    },
    get apiBaseUrl() {
      return process.env.SARVAM_API_BASE_URL || 'https://api.sarvam.ai';
    },
    get chatModel() {
      return process.env.SARVAM_CHAT_MODEL || 'sarvam-105b';
    },
    get defaultLanguageCode() {
      return 'en-IN';
    },
    get defaultVoiceId() {
      return 'amrit';
    },
    get defaultSpeakerGender() {
      return 'Male';
    },
  },

  // VoBiz Service Configuration
  vobiz: {
    get apiUrl() {
      return process.env.VOBIZ_API_URL || 'https://api.vobiz.ai/api/v1';
    },
    get encryptCredentials() {
      return process.env.ENCRYPT_CREDENTIALS === 'true';
    },
    get parentAuthId() {
      return process.env.VOBIZ_PARENT_AUTH_ID;
    },
    get parentAuthToken() {
      return process.env.VOBIZ_PARENT_AUTH_TOKEN;
    },
  },

  // Redis Configuration
  redis: {
    get host() {
      return process.env.REDIS_HOST || '127.0.0.1';
    },
    get port() {
      return parseInt(process.env.REDIS_PORT || '6379', 10);
    },
    get password() {
      return process.env.REDIS_PASSWORD || null;
    },
  },

  // Database Configuration
  db: {
    get name() {
      return process.env.DB_NAME || 'callkardo_db';
    },
    get user() {
      return process.env.DB_USER || 'root';
    },
    get password() {
      return process.env.DB_PASSWORD || '';
    },
    get host() {
      return process.env.DB_HOST || '127.0.0.1';
    },
    get port() {
      return parseInt(process.env.DB_PORT || '3306', 10);
    },
    get logging() {
      return process.env.DB_LOGGING === 'true';
    },
  },

  // JWT Configuration
  jwt: {
    get secret() {
      return process.env.JWT_SECRET || 'ailive_access_secret_key_2026_prod';
    },
    get refreshSecret() {
      return process.env.JWT_REFRESH_SECRET || 'ailive_refresh_secret_key_2026_prod';
    },
    get accessExpiration() {
      return process.env.JWT_ACCESS_EXPIRATION || '15m';
    },
    get refreshExpiration() {
      return process.env.JWT_REFRESH_EXPIRATION || '7d';
    },
  },

  // SMTP Configuration
  smtp: {
    get host() {
      return process.env.SMTP_HOST || null;
    },
    get port() {
      return parseInt(process.env.SMTP_PORT || '587', 10);
    },
    get user() {
      return process.env.SMTP_USER || null;
    },
    get pass() {
      return process.env.SMTP_PASS || null;
    },
    get from() {
      return process.env.SMTP_FROM || 'noreply@ailive.com';
    },
  },

  // LiveKit Configuration
  livekit: {
    get url() {
      return process.env.LIVEKIT_URL || 'ws://localhost:7880';
    },
    get apiKey() {
      return process.env.LIVEKIT_API_KEY || 'devkey';
    },
    get apiSecret() {
      return process.env.LIVEKIT_API_SECRET || 'secret';
    },
    get sipHost() {
      return process.env.LIVEKIT_SIP_HOST || '127.0.0.1:5060';
    },
  },
};
