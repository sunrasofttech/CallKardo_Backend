const { VobizAccount, VobizNumber } = require('../models');
const ResponseBuilder = require('../utils/response');
const { connectAccountSchema, addNumberSchema, updateNumberSchema } = require('../validators/vobiz');
const { encrypt, decrypt } = require('../utils/crypto');
const defaults = require('../config/defaults');

class VobizController {
  /**
   * Webhook invoked by VoBiz when the call is answered.
   * We return XML instructing VoBiz to connect a WebSocket stream.
   */
  async answerCallWebhook(req, res, next) {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).send('Missing token');
      }

      const streamUrl = `wss://${defaults.ws.host}/ws/vobiz?token=${token}`;
      
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream url="${streamUrl}" keepCallAlive="true" />
</Response>`;

      res.set('Content-Type', 'text/xml');
      return res.send(xml);
    } catch (err) {
      console.error('VoBiz answer webhook error:', err);
      return res.status(500).send('Internal Server Error');
    }
  }

  /**
   * Connect or update VoBiz credentials
   */
  async connectAccount(req, res, next) {
    try {
      const { error, value } = connectAccountSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { customerId, apiKey, apiSecret } = value;
      
      const encryptEnabled = defaults.vobiz.encryptCredentials;
      const finalApiKey = encryptEnabled ? encrypt(apiKey) : apiKey;
      const finalApiSecret = encryptEnabled ? encrypt(apiSecret) : apiSecret;

      let account = await VobizAccount.findOne({ where: { userId: req.user.id } });

      if (account) {
        await account.update({ customerId, apiKey: finalApiKey, apiSecret: finalApiSecret });
      } else {
        account = await VobizAccount.create({
          userId: req.user.id,
          customerId,
          apiKey: finalApiKey,
          apiSecret: finalApiSecret,
        });
      }

      // Hide API Key/Secret prefix in response for security
      const sanitizedResponse = {
        id: account.id,
        customerId: account.customerId,
        apiKey: `${apiKey.substring(0, 4)}...`,
      };

      return ResponseBuilder.success(res, sanitizedResponse, 'VoBiz account connected successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get connected account details
   */
  async getAccount(req, res, next) {
    try {
      const account = await VobizAccount.findOne({ where: { userId: req.user.id } });
      if (!account) {
        return ResponseBuilder.error(res, 'VoBiz account credentials not configured yet', 404);
      }

      const decryptedApiKey = decrypt(account.apiKey);

      return ResponseBuilder.success(res, {
        id: account.id,
        customerId: account.customerId,
        apiKey: `${decryptedApiKey.substring(0, 4)}...`,
      }, 'VoBiz account configuration retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all merchant's VoBiz numbers
   */
  async getNumbers(req, res, next) {
    try {
      const numbers = await VobizNumber.findAll({ where: { userId: req.user.id } });
      return ResponseBuilder.success(res, numbers, 'VoBiz numbers retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Add a new VoBiz number
   */
  async addNumber(req, res, next) {
    try {
      const { error, value } = addNumberSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { number, status, providerData } = value;

      // Verify if number already exists under this merchant
      const existing = await VobizNumber.findOne({
        where: { userId: req.user.id, number },
      });
      if (existing) {
        return ResponseBuilder.error(res, 'This phone number is already registered under your account', 400);
      }

      const vobizNumber = await VobizNumber.create({
        userId: req.user.id,
        number,
        status,
        providerData,
      });

      return ResponseBuilder.success(res, vobizNumber, 'VoBiz number added successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update VoBiz number details (Status, Provider data)
   */
  async updateNumber(req, res, next) {
    try {
      const { error, value } = updateNumberSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const vobizNumber = await VobizNumber.findOne({
        where: { id: req.params.id, userId: req.user.id },
      });

      if (!vobizNumber) {
        return ResponseBuilder.error(res, 'VoBiz number record not found', 404);
      }

      const { status, providerData } = value;

      await vobizNumber.update({
        status: status !== undefined ? status : vobizNumber.status,
        providerData: providerData !== undefined ? providerData : vobizNumber.providerData,
      });

      return ResponseBuilder.success(res, vobizNumber, 'VoBiz number updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Delete VoBiz number
   */
  async deleteNumber(req, res, next) {
    try {
      const vobizNumber = await VobizNumber.findOne({
        where: { id: req.params.id, userId: req.user.id },
      });

      if (!vobizNumber) {
        return ResponseBuilder.error(res, 'VoBiz number record not found', 404);
      }

      await vobizNumber.destroy();
      return ResponseBuilder.success(res, null, 'VoBiz number deleted successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new VobizController();
