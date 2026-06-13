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
      return parseInt(process.env.WS_PORT || '8000', 10);
    },
    get host() {
      return process.env.WS_HOST || '127.0.0.1:8000';
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
      return process.env.GEMINI_LIVE_MODEL || 'models/gemini-2.5-flash';
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
      return process.env.VOBIZ_API_URL || 'https://api.vobiz.example.com/v1';
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
      return process.env.DB_NAME || 'ailive_backend';
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
};
