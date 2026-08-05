const { VobizAccount, VobizNumber, User, Agent, Customer, CallSession, CallLog, KycDetail } = require('../models');
const { Op } = require('sequelize');
const ResponseBuilder = require('../utils/response');
const { connectAccountSchema, addNumberSchema, updateNumberSchema, buyNumberSchema } = require('../validators/vobiz');
const { encrypt, decrypt } = require('../utils/crypto');
const vobizService = require('../services/vobizService');
const defaults = require('../config/defaults');
const { removeTrialDemoNumber } = require('../services/trialDemoNumberService');
const crypto = require('crypto');
class VobizController {
  /**
   * Webhook invoked by VoBiz when the call is answered.
   * We return XML instructing VoBiz to connect a WebSocket stream.
   */
  async answerCallWebhook(req, res, next) {
    try {
      console.log('[VoBiz Webhook] Incoming call webhook request:', {
        method: req.method,
        query: req.query,
        body: req.body
      });
      const { token } = req.query;

      // Outbound call flow: token already generated and passed as query parameter
      if (token) {
        const streamUrl = `wss://${defaults.ws.host}/ws/vobiz?token=${token}`;
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=16000">${streamUrl}</Stream>
    <Wait length="3600" />
</Response>`;

        res.set('Content-Type', 'text/xml');
        return res.send(xml);
      }

      // Inbound call flow: resolve by dialed number (To) and caller number (From)
      const toNum = req.body.To || req.query.To || req.body.to || req.query.to;
      const fromNum = req.body.From || req.query.From || req.body.from || req.query.from;

      if (!toNum || !fromNum) {
        console.error('VoBiz Inbound call webhook missing To or From parameter:', { query: req.query, body: req.body });
        return res.status(400).send('Missing To or From parameter');
      }

      const cleanToNum = toNum.startsWith('+') ? toNum.substring(1) : toNum;
      
      // Generate search variations to support local trunk '0' dialing and country code formats
      const searchNumbers = [toNum, cleanToNum, `+${cleanToNum}`];
      if (toNum.startsWith('0')) {
        const base = toNum.substring(1);
        searchNumbers.push(base, `+91${base}`, `91${base}`);
      } else if (cleanToNum.startsWith('91')) {
        const base = cleanToNum.substring(2);
        searchNumbers.push(base, `0${base}`);
      }
      
      // Look up all registered VobizNumber records matching the dialed number
      const vobizNumbers = await VobizNumber.findAll({
        where: {
          number: { [Op.in]: searchNumbers },
          status: 'active'
        },
        include: [{ model: Agent, as: 'agent' }]
      });

      let vobizNumber = null;

      if (vobizNumbers.length === 1) {
        vobizNumber = vobizNumbers[0];
      } else if (vobizNumbers.length > 1) {
        // Shared number scenario (e.g. demo number used by multiple merchants)
        // Find which merchant this customer interacted with last.
        const lastSession = await CallSession.findOne({
          include: [{
            model: Customer,
            as: 'customer',
            where: { mobile: fromNum }
          }],
          order: [['createdAt', 'DESC']]
        });

        if (lastSession) {
          // Find the vobizNumber matching the merchant of the last session
          vobizNumber = vobizNumbers.find(n => n.userId === lastSession.userId);
        }

        // If no call session found, check if they exist as a Customer for any of these merchants
        if (!vobizNumber) {
          const userIds = vobizNumbers.map(n => n.userId);
          const lastCustomer = await Customer.findOne({
            where: { mobile: fromNum, userId: { [Op.in]: userIds } },
            order: [['createdAt', 'DESC']]
          });
          if (lastCustomer) {
            vobizNumber = vobizNumbers.find(n => n.userId === lastCustomer.userId);
          }
        }

        // Fallback to the most recently created vobizNumber if completely unknown
        if (!vobizNumber) {
          vobizNumber = vobizNumbers.sort((a, b) => b.createdAt - a.createdAt)[0];
        }
      }

      if (!vobizNumber || !vobizNumber.agentId || !vobizNumber.agent) {
        console.warn(`No active agent configured for VoBiz inbound number: ${toNum}`);
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Speak voice="WOMAN" language="en-US">This number is not configured to receive calls at this time.</Speak>
    <Hangup/>
</Response>`;
        console.log('[VoBiz Webhook] Returning No-Agent XML:', xml);
        res.set('Content-Type', 'text/xml');
        return res.send(xml);
      }

      console.log(`[VoBiz Webhook] Resolved VobizNumber matching "${toNum}":`, {
        vobizNumberId: vobizNumber.id,
        agentId: vobizNumber.agentId,
        agentName: vobizNumber.agent.name,
        aiProvider: vobizNumber.agent.aiProvider
      });

      // Find or register customer record for caller
      let customer = await Customer.findOne({
        where: {
          userId: vobizNumber.userId,
          mobile: fromNum
        }
      });

      if (!customer) {
        customer = await Customer.create({
          userId: vobizNumber.userId,
          mobile: fromNum,
          name: 'Inbound Caller'
        });
      }

      // Generate a new WebSocket session token for this call
      const wsToken = crypto.randomBytes(32).toString('hex');
      const session = await CallSession.create({
        userId: vobizNumber.userId,
        agentId: vobizNumber.agentId,
        vobizNumberId: vobizNumber.id,
        customerId: customer.id,
        wsSessionToken: wsToken,
        vobizCallUuid: req.body.CallUUID || req.query.CallUUID || req.body.call_uuid || req.query.call_uuid || null,
        status: 'initiated',
        direction: 'inbound',
      });

      await CallLog.create({
        callSessionId: session.id,
        logLevel: 'info',
        message: `Inbound call from ${fromNum} to ${toNum} answered. aiProvider: ${vobizNumber.agent.aiProvider}`,
      });

      // Route dynamically based on Agent AI Provider configuration
      if (vobizNumber.agent.aiProvider === 'elevenlabs') {
        const isIndia = fromNum.includes('91') || toNum.includes('91');
        const sipEndpoint = isIndia 
          ? 'sip.rtc.in.residency.elevenlabs.io:5060;transport=tcp' 
          : 'sip.rtc.elevenlabs.io:5060;transport=tcp';

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <User>sip:${sipEndpoint}</User>
    </Dial>
</Response>`;
        console.log('[VoBiz Webhook] Returning ElevenLabs XML:', xml);
        res.set('Content-Type', 'text/xml');
        return res.send(xml);
      }


      // Default fallback: Custom WebSocket server stream
      const streamUrl = `wss://${defaults.ws.host}/ws/vobiz?token=${wsToken}`;
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Stream bidirectional="true" keepCallAlive="true" contentType="audio/x-l16;rate=16000">${streamUrl}</Stream>
    <Wait length="3600" />
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

      const { number, status, providerData, agentId } = value;

      // Verify if number already exists under this merchant
      const existing = await VobizNumber.findOne({
        where: { userId: req.user.id, number },
      });
      if (existing) {
        return ResponseBuilder.error(res, 'This phone number is already registered under your account', 400);
      }

      // Verify if agent exists under this merchant
      if (agentId) {
        const agent = await Agent.findOne({ where: { id: agentId, userId: req.user.id } });
        if (!agent) {
          return ResponseBuilder.error(res, 'Target Agent not found or not active under your account', 404);
        }
      }

      // Setup inbound routing in Vobiz if sub-account is configured
      try {
        const account = await VobizAccount.findOne({ where: { userId: req.user.id } });
        if (account) {
          const encryptEnabled = defaults.vobiz.encryptCredentials;
          const decryptedApiSecret = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;

          await vobizService.setupInboundRouting({
            authId: account.customerId,
            authToken: decryptedApiSecret,
            number: number
          });
        }
      } catch (routingErr) {
        console.error('Failed to setup inbound routing on manual add:', routingErr.message);
      }

      const vobizNumber = await VobizNumber.create({
        userId: req.user.id,
        number,
        status,
        agentId,
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

      const { status, providerData, agentId } = value;

      // Verify if agent exists under this merchant
      if (agentId) {
        const agent = await Agent.findOne({ where: { id: agentId, userId: req.user.id } });
        if (!agent) {
          return ResponseBuilder.error(res, 'Target Agent not found or not active under your account', 404);
        }
      }

      await vobizNumber.update({
        status: status !== undefined ? status : vobizNumber.status,
        agentId: agentId !== undefined ? agentId : vobizNumber.agentId,
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

      if (vobizNumber.providerData && vobizNumber.providerData.isDemo) {
        return ResponseBuilder.error(res, 'Cannot delete system-provided demo number', 400);
      }

      // Unrent the number from Vobiz
      await vobizService.unrentNumber(vobizNumber.number);

      await vobizNumber.destroy();
      return ResponseBuilder.success(res, null, 'VoBiz number deleted and unrented successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Create a Vobiz Sub-Account for the merchant
   */
  async createSubAccount(req, res, next) {
    try {
      let account = await VobizAccount.findOne({ where: { userId: req.user.id } });
      if (account) {
        return ResponseBuilder.error(res, 'Vobiz sub-account is already provisioned for this user', 400);
      }

      const user = await User.findByPk(req.user.id);
      if (!user) {
        return ResponseBuilder.error(res, 'User not found', 404);
      }

      // Combine merchant details to save in Vobiz since they only accept 'name'
      const subAccountName = [
        user.businessName, 
        `${user.firstName} ${user.lastName}`.trim(), 
        user.email, 
        user.phoneNumber
      ].filter(Boolean).join(' | ').substring(0, 100); // Vobiz name limit might apply

      const subAccountData = await vobizService.createSubAccount(
        subAccountName, 
        user.email, 
        'customer_use', 
        user.businessType || 'individual'
      );

      const encryptEnabled = defaults.vobiz.encryptCredentials;
      const finalApiKey = encryptEnabled ? encrypt(subAccountData.authId) : subAccountData.authId;
      const finalApiSecret = encryptEnabled ? encrypt(subAccountData.authToken) : subAccountData.authToken;

      account = await VobizAccount.create({
        userId: user.id,
        customerId: subAccountData.authId, // Using authId as customerId for subaccounts
        apiKey: finalApiKey,
        apiSecret: finalApiSecret,
      });

      // Update user KYC status to pending since it's a customer_use subaccount
      await user.update({ kycStatus: 'pending' });

      const sanitizedResponse = {
        id: account.id,
        customerId: account.customerId,
        apiKey: `${subAccountData.authId.substring(0, 4)}...`,
      };

      return ResponseBuilder.success(res, sanitizedResponse, 'Vobiz sub-account created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * List available phone numbers to purchase
   */
  async listAvailableNumbers(req, res, next) {
    try {
      const { countryISO, type, pattern, page, per_page } = req.query;
      const parsedPage = parseInt(page, 10) || 1;
      const parsedPerPage = parseInt(per_page, 10) || 25;
      
      const numbers = await vobizService.listAvailableNumbers(
        countryISO, 
        type, 
        pattern, 
        parsedPage, 
        parsedPerPage
      );
      return ResponseBuilder.success(res, numbers, 'Available numbers retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Buy a specific phone number and assign it to the merchant's sub-account
   */
  async buyNumber(req, res, next) {
    try {
      const { error, value } = buyNumberSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { number } = value;

      const account = await VobizAccount.findOne({ where: { userId: req.user.id } });
      if (!account) {
        return ResponseBuilder.error(res, 'Vobiz sub-account not found. Please provision one first.', 404);
      }

      const subAccountAuthId = account.customerId; // Assuming customerId stores the sub-account authId

      // Buy the number using parent account
      const purchaseResult = await vobizService.buyNumber(number);

      // Assign to the sub-account
      await vobizService.assignNumberToSubAccount(number, subAccountAuthId);

      // Setup inbound routing in the sub-account
      try {
        const encryptEnabled = defaults.vobiz.encryptCredentials;
        const decryptedApiSecret = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;

        await vobizService.setupInboundRouting({
          authId: subAccountAuthId,
          authToken: decryptedApiSecret,
          number: number
        });
      } catch (routingErr) {
        console.error('Failed to setup inbound routing on purchase:', routingErr.message);
      }

      const rentalExpiryDate = new Date();
      rentalExpiryDate.setMonth(rentalExpiryDate.getMonth() + 1);

      // Save to database
      const vobizNumber = await VobizNumber.create({
        userId: req.user.id,
        number: number,
        status: 'active',
        rentalExpiryDate,
        providerData: purchaseResult,
      });

      return ResponseBuilder.success(res, vobizNumber, 'Phone number purchased and assigned successfully', 201);
    } catch (err) {
      next(err);
    }
  }
  /**
   * Generate KYC Session (Hosted Email Flow)
   */
  async generateKycSession(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);
      if (!user) return ResponseBuilder.error(res, 'User not found', 404);

      const account = await VobizAccount.findOne({ where: { userId: user.id } });
      if (!account) {
        return ResponseBuilder.error(res, 'Vobiz sub-account not found. Please provision one first.', 404);
      }

      // Decrypt credentials
      const encryptEnabled = defaults.vobiz.encryptCredentials;
      const decryptedAuthToken = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;
      const authId = account.customerId;

      // Ensure we have an email
      if (!user.email) {
        return ResponseBuilder.error(res, 'User email is required for KYC email flow', 400);
      }

      // Webhook URL (Construct based on your environment)
      // Assuming a generic pattern for now or pulling from env if configured
      const hostUrl = req.protocol + '://' + req.get('host');
      const webhookUrl = `${hostUrl}/api/v1/vobiz/kyc/webhook`;

      // Call Vobiz Service
      const result = await vobizService.generateKycSession(authId, decryptedAuthToken, user.email, webhookUrl);

      if (result.success) {
        // Log the session in DB
        await KycDetail.create({
          userId: user.id,
          sessionId: result.session_id,
          status: result.status || 'email_sent',
          vobizResponse: result
        });

        return ResponseBuilder.success(res, result, 'KYC session generated and email sent');
      } else {
        return ResponseBuilder.error(res, result.error, 400);
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get overall KYC Status from Vobiz
   */
  async getKycStatus(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id);
      const account = await VobizAccount.findOne({ where: { userId: req.user.id } });
      if (!account) {
        return ResponseBuilder.error(res, 'Vobiz sub-account not found.', 404);
      }

      const encryptEnabled = defaults.vobiz.encryptCredentials;
      const decryptedAuthToken = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;
      const authId = account.customerId;

      const result = await vobizService.getKycStatus(authId, decryptedAuthToken);
      
      if (result.success) {
        // If overall status is verified, mark user as full
        if (result.overall_status === 'verified' && result.kyc_calls_blocked === false) {
          if (user.kycStatus !== 'full') {
            await user.update({ kycStatus: 'full' });
          }
        }
        return ResponseBuilder.success(res, result, 'KYC status retrieved');
      } else {
        return ResponseBuilder.error(res, result.error, 400);
      }
    } catch (err) {
      next(err);
    }
  }
  /**
   * Webhook to receive automated KYC status updates from Vobiz
   */
  async kycWebhook(req, res, next) {
    try {
      const payload = req.body;
      console.log('[VoBiz KYC Webhook] Received event:', payload);

      // Attempt to extract the sub-account auth ID from common field names
      const authId = payload.sub_auth_id || payload.auth_id || payload.customer_id;

      if (!authId) {
        console.warn('[VoBiz KYC Webhook] Missing authId in payload. Acknowledging anyway.');
        return res.status(200).send('OK');
      }

      const account = await VobizAccount.findOne({ where: { customerId: authId } });
      if (!account) {
        console.warn(`[VoBiz KYC Webhook] No matching sub-account found for authId: ${authId}`);
        return res.status(200).send('OK');
      }

      const user = await User.findByPk(account.userId);
      if (!user) {
        return res.status(200).send('OK');
      }

      // Store the webhook payload in KycDetail
      let kycRecord = await KycDetail.findOne({
        where: { userId: user.id },
        order: [['createdAt', 'DESC']]
      });

      if (!kycRecord) {
        kycRecord = await KycDetail.create({
          userId: user.id,
          status: 'webhook_received',
          vobizResponse: payload
        });
      } else {
        await kycRecord.update({
          vobizResponse: payload,
          status: payload.status || kycRecord.status
        });
      }

      // We actively fetch the latest status to verify it securely rather than relying solely on the payload
      const encryptEnabled = defaults.vobiz.encryptCredentials;
      const decryptedAuthToken = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;
      
      const statusResult = await vobizService.getKycStatus(authId, decryptedAuthToken);
      
      if (statusResult.success) {
        if (statusResult.overall_status === 'verified' && statusResult.kyc_calls_blocked === false) {
          if (user.kycStatus !== 'full') {
            await user.update({ kycStatus: 'full' });
            console.log(`[VoBiz KYC Webhook] Successfully updated User ${user.id} kycStatus to 'full'`);
          }
        } else if (statusResult.overall_status === 'failed') {
          // You could potentially add notification logic here to alert the merchant they failed
          console.log(`[VoBiz KYC Webhook] User ${user.id} KYC failed or still blocked.`);
        }
      }

      return res.status(200).send('OK');
    } catch (err) {
      console.error('[VoBiz KYC Webhook] Processing Error:', err);
      return res.status(500).send('Internal Error'); // 500 will trigger Vobiz exponential backoff retries
    }
  }
}

module.exports = new VobizController();
