const crypto = require('crypto');
const { User } = require('../models');

class MerchantIntegrationController {
  // Get current integration settings
  async getSettings(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      res.status(200).json({
        success: true,
        data: {
          apiKey: user.apiKey,
          webhookUrl: user.webhookUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Generate a new API Key
  async generateApiKey(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // Generate a new key, prefix with 'ck_live_' for CallKardo
      const newApiKey = 'ck_live_' + crypto.randomBytes(32).toString('hex');
      
      user.apiKey = newApiKey;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'API Key generated successfully',
        data: {
          apiKey: user.apiKey
        }
      });
    } catch (error) {
      next(error);
    }
  }

  // Update Webhook URL
  async updateWebhook(req, res, next) {
    try {
      const { webhookUrl } = req.body;
      const user = await User.findByPk(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });

      // If webhookUrl is empty string or null, we remove it
      user.webhookUrl = webhookUrl || null;
      await user.save();

      res.status(200).json({
        success: true,
        message: 'Webhook URL updated successfully',
        data: {
          webhookUrl: user.webhookUrl
        }
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new MerchantIntegrationController();
