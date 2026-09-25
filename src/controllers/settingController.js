const { Setting } = require('../models');
const ResponseBuilder = require('../utils/response');
const { updatePageSchema, upsertSettingSchema } = require('../validators/setting');

// Default initial content for system pages
const DEFAULT_PAGES = {
  terms: {
    title: 'Terms & Conditions',
    content: 'Welcome to Kardo. By using our platform, you agree to comply with and be bound by our terms and conditions.',
    sections: [
      { id: 1, title: 'Acceptance of terms', details: 'By accessing or using Kardo, you agree to be bound by these terms.' },
      { id: 2, title: 'User accounts and responsibilities', details: 'Users are responsible for maintaining account confidentiality and all activity under their account.' },
      { id: 3, title: 'Acceptable use policy', details: 'Kardo must not be used for illegal activities, harassment, spamming, or fraudulent voice calling.' },
      { id: 4, title: 'Subscription and payment terms', details: 'Subscription fees are billed periodically based on your chosen plan.' },
      { id: 5, title: 'Cancellation and refunds', details: 'Subscriptions may be cancelled at any time. Refunds are governed by our billing policy.' },
      { id: 6, title: 'Intellectual property', details: 'All platform code, designs, models, and branding remain exclusive intellectual property of Kardo.' },
      { id: 7, title: 'Limitation of liability', details: 'Kardo is provided as-is without warranties of uninterrupted service.' },
      { id: 8, title: 'Account suspension or termination', details: 'We reserve the right to suspend accounts violating acceptable use policies.' },
      { id: 9, title: 'Contact information', details: 'For support or legal inquiries, reach out to support@callkardo.com.' },
    ],
    contactEmail: 'support@callkardo.com',
    updatedAt: new Date().toISOString(),
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    content: 'Your privacy is paramount. Kardo collects and protects your data in accordance with modern privacy standards.',
    sections: [
      { id: 1, title: 'What information we collect', details: 'Name, phone number, email address, and contacts (only if permission is explicitly granted).' },
      { id: 2, title: 'Call recordings', details: 'Calls are recorded strictly with user consent for quality assurance, transcriptions, and AI agent processing.' },
      { id: 3, title: 'AI voice processing', details: 'Voice audio data is processed via secure encrypted streaming for real-time speech recognition and text-to-speech.' },
      { id: 4, title: 'Calendar & schedule data', details: 'Schedule data is accessed solely to manage automated reminders and meeting calls.' },
      { id: 5, title: 'Device permissions', details: 'App requires microphone, contacts, and notification permissions only when requested by user.' },
      { id: 6, title: 'How user data is stored and protected', details: 'Data is stored securely using industry-standard encryption protocols both in transit and at rest.' },
      { id: 7, title: 'Data sharing with third parties', details: 'We do not sell user data to third parties. Data is shared only with encrypted AI voice subprocessors necessary for service.' },
      { id: 8, title: 'User rights', details: 'Users have the right to request data export, modify details, or permanently delete their account at any time.' },
      { id: 9, title: 'Contact email', details: 'Privacy queries can be sent to support@callkardo.com.' },
    ],
    contactEmail: 'support@callkardo.com',
    updatedAt: new Date().toISOString(),
  },
  'about-us': {
    title: 'About Us',
    content: 'Kardo is an AI-powered communication platform designed to simplify personal and business conversations. Users can schedule meetings, manage contacts, create groups, and use AI-powered calling features with natural human-like voice interactions. Our goal is to make communication smarter, faster, and more productive while protecting user privacy and security.',
    updatedAt: new Date().toISOString(),
  },
  features: {
    title: 'Features',
    items: [
      { icon: '🤖', title: 'AI-powered voice calling', description: 'Make automated, intelligent voice calls powered by AI agents.' },
      { icon: '📅', title: 'Schedule meetings and reminders', description: 'Set up automated calls and meeting reminders seamlessly.' },
      { icon: '📞', title: 'Make and receive calls', description: 'High quality voice calling capabilities.' },
      { icon: '👥', title: 'Create and manage groups', description: 'Organize contacts into custom groups and lists.' },
      { icon: '📇', title: 'Contact management', description: 'Manage and sync your business and personal contacts.' },
      { icon: '🎙️', title: 'Human-like AI voice', description: 'Natural sounding conversational AI voices in multiple languages.' },
      { icon: '🔊', title: 'Call recording', description: 'Record calls securely with full user consent.' },
      { icon: '🔔', title: 'Notifications and reminders', description: 'Instant alerts and scheduled reminder calls.' },
      { icon: '☁️', title: 'Secure cloud synchronization', description: 'Keep all your data synced across devices securely.' },
      { icon: '💳', title: 'Subscription plans', description: 'Flexible plans tailored to personal and enterprise needs.' },
    ],
    updatedAt: new Date().toISOString(),
  },
  'help-support': {
    title: 'Help & Support',
    content: 'Need help? Contact our support team or check our frequently asked questions.',
    contactEmail: 'support@callkardo.com',
    contactPhone: '+1-800-CALLKARDO',
    faq: [
      { question: 'How do I create an AI agent?', answer: 'Navigate to Agents tab and click Create New Agent.' },
      { question: 'How do I top up calling credits?', answer: 'Go to Subscriptions and choose a plan.' },
    ],
    updatedAt: new Date().toISOString(),
  },
};

// Normalize page slug to key name
const getPageKey = (slug) => {
  const normalized = slug.toLowerCase().replace(/_/g, '-');
  if (normalized === 'terms' || normalized === 'terms-and-conditions') return 'page_terms';
  if (normalized === 'privacy' || normalized === 'privacy-policy') return 'page_privacy_policy';
  if (normalized === 'about' || normalized === 'about-us') return 'page_about_us';
  if (normalized === 'features' || normalized === 'app-features') return 'page_features';
  if (normalized === 'help' || normalized === 'help-support' || normalized === 'help-and-support') return 'page_help_support';
  return `page_${normalized}`;
};

const getSlugFromKey = (key) => {
  if (key === 'page_terms') return 'terms';
  if (key === 'page_privacy_policy') return 'privacy-policy';
  if (key === 'page_about_us') return 'about-us';
  if (key === 'page_features') return 'features';
  if (key === 'page_help_support') return 'help-support';
  return key.replace(/^page_/, '');
};

class SettingController {
  /**
   * Get all public pages content (Terms, Privacy Policy, About Us, Features, Help & Support)
   */
  async getAllPages(req, res, next) {
    try {
      const pageKeys = ['page_terms', 'page_privacy_policy', 'page_about_us', 'page_features', 'page_help_support'];
      const dbSettings = await Setting.findAll({
        where: { key: pageKeys },
      });

      const dbMap = {};
      dbSettings.forEach((item) => {
        dbMap[getSlugFromKey(item.key)] = item.value;
      });

      const pages = {
        terms: dbMap['terms'] || DEFAULT_PAGES['terms'],
        privacyPolicy: dbMap['privacy-policy'] || DEFAULT_PAGES['privacy-policy'],
        aboutUs: dbMap['about-us'] || DEFAULT_PAGES['about-us'],
        features: dbMap['features'] || DEFAULT_PAGES['features'],
        helpSupport: dbMap['help-support'] || DEFAULT_PAGES['help-support'],
      };

      return ResponseBuilder.success(res, pages, 'App content pages retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get single page content by slug (e.g. 'terms', 'privacy-policy', 'about-us', 'help-support')
   */
  async getPageBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const pageKey = getPageKey(slug);
      const normalizedSlug = getSlugFromKey(pageKey);

      const dbSetting = await Setting.findOne({ where: { key: pageKey } });

      if (dbSetting) {
        return ResponseBuilder.success(res, dbSetting.value, `${slug} page retrieved successfully`);
      }

      const defaultContent = DEFAULT_PAGES[normalizedSlug] || {
        title: slug.replace(/-/g, ' ').toUpperCase(),
        content: '',
        updatedAt: new Date().toISOString(),
      };

      return ResponseBuilder.success(res, defaultContent, `${slug} page retrieved successfully`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update page content (Admin Only)
   */
  async updatePageBySlug(req, res, next) {
    try {
      const { slug } = req.params;
      const { error, value } = updatePageSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const pageKey = getPageKey(slug);
      const normalizedSlug = getSlugFromKey(pageKey);
      const defaultBase = DEFAULT_PAGES[normalizedSlug] || {};

      let dbSetting = await Setting.findOne({ where: { key: pageKey } });

      const updatedData = {
        ...defaultBase,
        ...(dbSetting ? dbSetting.value : {}),
        ...value,
        updatedAt: new Date().toISOString(),
      };

      if (dbSetting) {
        await dbSetting.update({ value: updatedData });
      } else {
        dbSetting = await Setting.create({
          key: pageKey,
          value: updatedData,
        });
      }

      return ResponseBuilder.success(res, dbSetting.value, `${slug} page updated successfully`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all raw settings
   * Includes default gateway resolved from DB first, falling back to defaults.js
   */
  async getAllSettings(req, res, next) {
    try {
      const defaults = require('../config/defaults');
      const settings = await Setting.findAll();

      // Find default gateway: check DB first, then fallback to defaults.js
      let defaultGateway = null;

      // 1. Check if 'default_gateway' or 'active_gateway' is directly in DB settings
      const directSetting = settings.find((s) => s.key === 'default_gateway' || s.key === 'active_gateway');
      if (directSetting && directSetting.value) {
        defaultGateway = typeof directSetting.value === 'object'
          ? (directSetting.value.activeGateway || directSetting.value.defaultGateway || directSetting.value.gateway)
          : directSetting.value;
      }

      // 2. Check if 'payment_gateway_config' is in DB settings
      if (!defaultGateway) {
        const gwSetting = settings.find((s) => s.key === 'payment_gateway_config');
        if (gwSetting && gwSetting.value) {
          const configVal = typeof gwSetting.value === 'string' ? JSON.parse(gwSetting.value) : gwSetting.value;
          defaultGateway = configVal.activeGateway || configVal.defaultGateway;
        }
      }

      // 3. Fallback to defaults.js
      if (!defaultGateway) {
        defaultGateway = defaults.paymentGateway.activeGateway || 'razorpay';
      }

      // Convert DB records to plain objects
      const settingsList = settings.map((s) => (s.toJSON ? s.toJSON() : { ...s }));

      // Ensure default_gateway is present in the settings list
      const defaultGatewayIdx = settingsList.findIndex((s) => s.key === 'default_gateway');
      if (defaultGatewayIdx >= 0) {
        settingsList[defaultGatewayIdx].value = defaultGateway;
      } else {
        settingsList.push({
          id: 'default_gateway',
          key: 'default_gateway',
          value: defaultGateway,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      return res.status(200).json({
        success: true,
        message: 'All settings retrieved successfully',
        default_gateway: defaultGateway,
        defaultGateway: defaultGateway,
        data: settingsList,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get setting by key
   */
  async getSettingByKey(req, res, next) {
    try {
      const { key } = req.params;
      let setting = await Setting.findOne({ where: { key } });

      // If key is default_gateway or active_gateway, resolve via DB first then defaults.js
      if (!setting && (key === 'default_gateway' || key === 'active_gateway' || key === 'defaultGateway' || key === 'payment_gateway')) {
        const defaults = require('../config/defaults');
        const gwSetting = await Setting.findOne({ where: { key: 'payment_gateway_config' } });
        let dbGateway = null;
        if (gwSetting && gwSetting.value) {
          const configVal = typeof gwSetting.value === 'string' ? JSON.parse(gwSetting.value) : gwSetting.value;
          dbGateway = configVal.activeGateway || configVal.defaultGateway;
        }
        const defaultGateway = dbGateway || defaults.paymentGateway.activeGateway || 'razorpay';

        return ResponseBuilder.success(res, {
          id: key,
          key,
          value: defaultGateway,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }, 'Setting retrieved successfully');
      }

      if (!setting) {
        return ResponseBuilder.error(res, `Setting with key '${key}' not found`, 404);
      }

      return ResponseBuilder.success(res, setting, 'Setting retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Upsert setting by key (Admin Only)
   */
  async upsertSetting(req, res, next) {
    try {
      const { error, value } = upsertSettingSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { key, value: settingValue } = value;

      let setting = await Setting.findOne({ where: { key } });
      if (setting) {
        await setting.update({ value: settingValue });
      } else {
        setting = await Setting.create({ key, value: settingValue });
      }

      return ResponseBuilder.success(res, setting, `Setting '${key}' saved successfully`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete setting by key (Admin Only)
   */
  async deleteSetting(req, res, next) {
    try {
      const { key } = req.params;
      const setting = await Setting.findOne({ where: { key } });

      if (!setting) {
        return ResponseBuilder.error(res, `Setting with key '${key}' not found`, 404);
      }

      await setting.destroy();
      return ResponseBuilder.success(res, null, `Setting '${key}' deleted successfully`);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get Payment Gateway Configuration (Admin Only)
   * Returns the current active gateway and credentials for both ABCGate and PhonePe
   */
  async getPaymentGatewayConfig(req, res, next) {
    try {
      const defaults = require('../config/defaults');

      const setting = await Setting.findOne({ where: { key: 'payment_gateway_config' } });

      if (setting && setting.value) {
        // Mask sensitive fields for display
        const config = { ...setting.value };
        if (config.abcgate && config.abcgate.apiToken) {
          config.abcgate.apiToken = config.abcgate.apiToken.substring(0, 8) + '****';
        }
        if (config.phonepe && config.phonepe.clientSecret) {
          config.phonepe.clientSecret = config.phonepe.clientSecret.substring(0, 8) + '****';
        }
        if (config.phonepe && config.phonepe.callbackPassword) {
          config.phonepe.callbackPassword = '****';
        }
        if (config.razorpay && config.razorpay.keySecret) {
          config.razorpay.keySecret = config.razorpay.keySecret.substring(0, 8) + '****';
        }
        if (config.razorpay && config.razorpay.webhookSecret) {
          config.razorpay.webhookSecret = config.razorpay.webhookSecret.substring(0, 8) + '****';
        }
        return ResponseBuilder.success(res, config, 'Payment gateway configuration retrieved');
      }

      // Return defaults
      const defaultConfig = {
        activeGateway: defaults.paymentGateway.activeGateway || 'razorpay',
        abcgate: {
          apiUrl: defaults.paymentGateway.initiateUrl,
          apiToken: defaults.paymentGateway.apiToken ? defaults.paymentGateway.apiToken.substring(0, 8) + '****' : '',
          callbackUrl: 'https://api.abcgate.shop/api/callback/upiid',
        },
        phonepe: {
          clientId: defaults.phonepe.clientId || '',
          clientSecret: defaults.phonepe.clientSecret ? defaults.phonepe.clientSecret.substring(0, 8) + '****' : '',
          clientVersion: defaults.phonepe.clientVersion,
          env: defaults.phonepe.env,
          callbackUsername: defaults.phonepe.callbackUsername || '',
          callbackPassword: defaults.phonepe.callbackPassword ? '****' : '',
          redirectUrl: defaults.phonepe.redirectUrl,
        },
        razorpay: {
          keyId: defaults.razorpay.keyId || '',
          keySecret: defaults.razorpay.keySecret ? defaults.razorpay.keySecret.substring(0, 8) + '****' : '',
          webhookSecret: defaults.razorpay.webhookSecret ? defaults.razorpay.webhookSecret.substring(0, 8) + '****' : '',
        },
      };

      return ResponseBuilder.success(res, defaultConfig, 'Payment gateway configuration retrieved (defaults)');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update Payment Gateway Configuration (Admin Only)
   * Allows switching activeGateway and updating credentials
   */
  async updatePaymentGatewayConfig(req, res, next) {
    try {
      const { activeGateway, abcgate, phonepe, razorpay } = req.body;

      if (activeGateway && !['abcgate', 'phonepe', 'razorpay'].includes(activeGateway)) {
        return ResponseBuilder.error(res, "activeGateway must be 'abcgate', 'phonepe', or 'razorpay'", 400);
      }

      // Validate PhonePe credentials if switching to phonepe
      if (activeGateway === 'phonepe') {
        const defaults = require('../config/defaults');
        const existingSetting = await Setting.findOne({ where: { key: 'payment_gateway_config' } });
        const existing = existingSetting?.value?.phonepe || {};

        const finalClientId = phonepe?.clientId || existing.clientId || defaults.phonepe.clientId;
        const finalClientSecret = phonepe?.clientSecret || existing.clientSecret || defaults.phonepe.clientSecret;

        if (!finalClientId || !finalClientSecret || finalClientId === 'your_client_id_here') {
          return ResponseBuilder.error(res, 'PhonePe client_id and client_secret must be configured before activating PhonePe gateway', 400);
        }
      }

      // Validate Razorpay credentials if switching to razorpay
      if (activeGateway === 'razorpay') {
        const defaults = require('../config/defaults');
        const existingSetting = await Setting.findOne({ where: { key: 'payment_gateway_config' } });
        const existing = existingSetting?.value?.razorpay || {};

        const finalKeyId = razorpay?.keyId || existing.keyId || defaults.razorpay.keyId;
        const finalKeySecret = razorpay?.keySecret || existing.keySecret || defaults.razorpay.keySecret;

        if (!finalKeyId || !finalKeySecret || finalKeyId === 'your_razorpay_key_id') {
          return ResponseBuilder.error(res, 'Razorpay key_id and key_secret must be configured before activating Razorpay gateway', 400);
        }
      }

      // Load existing config
      let setting = await Setting.findOne({ where: { key: 'payment_gateway_config' } });
      const defaults = require('../config/defaults');

      const existingConfig = setting?.value || {
        activeGateway: defaults.paymentGateway.activeGateway || 'razorpay',
        abcgate: {
          apiUrl: defaults.paymentGateway.initiateUrl,
          apiToken: defaults.paymentGateway.apiToken,
          callbackUrl: 'https://api.abcgate.shop/api/callback/upiid',
        },
        phonepe: {
          clientId: defaults.phonepe.clientId,
          clientSecret: defaults.phonepe.clientSecret,
          clientVersion: defaults.phonepe.clientVersion,
          env: defaults.phonepe.env,
          callbackUsername: defaults.phonepe.callbackUsername,
          callbackPassword: defaults.phonepe.callbackPassword,
          redirectUrl: defaults.phonepe.redirectUrl,
        },
        razorpay: {
          keyId: defaults.razorpay.keyId,
          keySecret: defaults.razorpay.keySecret,
          webhookSecret: defaults.razorpay.webhookSecret,
        },
      };

      // Merge updates
      const updatedConfig = {
        activeGateway: activeGateway || existingConfig.activeGateway,
        abcgate: {
          ...existingConfig.abcgate,
          ...(abcgate || {}),
        },
        phonepe: {
          ...existingConfig.phonepe,
          ...(phonepe || {}),
        },
        razorpay: {
          ...existingConfig.razorpay,
          ...(razorpay || {}),
        },
      };

      if (setting) {
        await setting.update({ value: updatedConfig });
      } else {
        setting = await Setting.create({ key: 'payment_gateway_config', value: updatedConfig });
      }

      console.log(`[SettingController] Payment gateway config updated. Active gateway: ${updatedConfig.activeGateway}`);

      // Return response with masked secrets
      const responseConfig = { ...updatedConfig };
      if (responseConfig.abcgate?.apiToken) {
        responseConfig.abcgate.apiToken = responseConfig.abcgate.apiToken.substring(0, 8) + '****';
      }
      if (responseConfig.phonepe?.clientSecret) {
        responseConfig.phonepe.clientSecret = responseConfig.phonepe.clientSecret.substring(0, 8) + '****';
      }
      if (responseConfig.phonepe?.callbackPassword) {
        responseConfig.phonepe.callbackPassword = '****';
      }
      if (responseConfig.razorpay?.keySecret) {
        responseConfig.razorpay.keySecret = responseConfig.razorpay.keySecret.substring(0, 8) + '****';
      }
      if (responseConfig.razorpay?.webhookSecret) {
        responseConfig.razorpay.webhookSecret = responseConfig.razorpay.webhookSecret.substring(0, 8) + '****';
      }

      return ResponseBuilder.success(res, responseConfig, `Payment gateway configuration updated. Active: ${updatedConfig.activeGateway}`);
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new SettingController();
