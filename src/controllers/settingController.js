const { Setting } = require('../models');
const ResponseBuilder = require('../utils/response');
const { updatePageSchema, upsertSettingSchema } = require('../validators/setting');

// Default initial content for system pages
const DEFAULT_PAGES = {
  terms: {
    title: 'Terms & Conditions',
    content: 'Welcome to CallKardo. By using our platform, you agree to comply with and be bound by our terms and conditions.',
    updatedAt: new Date().toISOString(),
  },
  'privacy-policy': {
    title: 'Privacy Policy',
    content: 'Your privacy is important to us. CallKardo collects and manages user data in accordance with strict privacy guidelines.',
    updatedAt: new Date().toISOString(),
  },
  'about-us': {
    title: 'About Us',
    content: 'CallKardo is an AI-powered voice agent and calling platform providing automated voice interactions for businesses.',
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
  if (normalized === 'help' || normalized === 'help-support' || normalized === 'help-and-support') return 'page_help_support';
  return `page_${normalized}`;
};

const getSlugFromKey = (key) => {
  if (key === 'page_terms') return 'terms';
  if (key === 'page_privacy_policy') return 'privacy-policy';
  if (key === 'page_about_us') return 'about-us';
  if (key === 'page_help_support') return 'help-support';
  return key.replace(/^page_/, '');
};

class SettingController {
  /**
   * Get all public pages content (Terms, Privacy Policy, About Us, Help & Support)
   */
  async getAllPages(req, res, next) {
    try {
      const pageKeys = ['page_terms', 'page_privacy_policy', 'page_about_us', 'page_help_support'];
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
   */
  async getAllSettings(req, res, next) {
    try {
      const settings = await Setting.findAll();
      return ResponseBuilder.success(res, settings, 'All settings retrieved successfully');
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
      const setting = await Setting.findOne({ where: { key } });

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
}

module.exports = new SettingController();
