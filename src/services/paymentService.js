const axios = require('axios');
const crypto = require('crypto');
const defaults = require('../config/defaults');
const { PaymentTransaction, User, Plan, Subscription, SubscriptionHistory, VobizAccount, VobizNumber, Setting } = require('../models');
const vobizService = require('./vobizService');
const { removeTrialDemoNumber } = require('./trialDemoNumberService');
const { decrypt } = require('../utils/crypto');
const NotificationService = require('./notificationService');

// PhonePe SDK imports
let StandardCheckoutClient, StandardCheckoutPayRequest, PhonePeEnv;
try {
  const phonepeSdk = require('@phonepe-pg/pg-sdk-node');
  StandardCheckoutClient = phonepeSdk.StandardCheckoutClient;
  StandardCheckoutPayRequest = phonepeSdk.StandardCheckoutPayRequest;
  PhonePeEnv = phonepeSdk.Env;
} catch (err) {
  console.warn('[PaymentService] PhonePe SDK not available:', err.message);
}

// Razorpay SDK imports
let Razorpay;
let validatePaymentVerification, validateWebhookSignature;
try {
  Razorpay = require('razorpay');
  const razorpayUtils = require('razorpay/dist/utils/razorpay-utils');
  validatePaymentVerification = razorpayUtils.validatePaymentVerification;
  validateWebhookSignature = razorpayUtils.validateWebhookSignature;
} catch (err) {
  console.warn('[PaymentService] Razorpay SDK not available:', err.message);
}

class PaymentService {
  constructor() {
    this._phonePeClient = null;
    this._razorpayClient = null;
  }

  /**
   * Get the active payment gateway config.
   * First checks what default gateway is configured in DB, then falls back to defaults.js.
   * Returns { activeGateway, defaultGateway, abcgate: {...}, phonepe: {...}, razorpay: {...} }
   */
  async _getGatewayConfig() {
    let dbDefaultGateway = null;
    let dbConfig = null;

    try {
      // 1. Check payment_gateway_config in DB
      const pgSetting = await Setting.findOne({ where: { key: 'payment_gateway_config' } });
      if (pgSetting && pgSetting.value) {
        dbConfig = typeof pgSetting.value === 'string' ? JSON.parse(pgSetting.value) : pgSetting.value;
        dbDefaultGateway = dbConfig.activeGateway || dbConfig.defaultGateway || null;
      }

      // 2. Check default_gateway or active_gateway in DB if not found in payment_gateway_config
      if (!dbDefaultGateway) {
        const directSetting = await Setting.findOne({
          where: { key: ['default_gateway', 'active_gateway'] },
        });
        if (directSetting && directSetting.value) {
          dbDefaultGateway = typeof directSetting.value === 'object'
            ? (directSetting.value.activeGateway || directSetting.value.defaultGateway || directSetting.value.gateway)
            : directSetting.value;
        }
      }
    } catch (err) {
      console.warn('[PaymentService] Could not load gateway config from DB, using defaults:', err.message);
    }

    // 3. Fallback to defaults.js if not found in DB
    const activeGateway = dbDefaultGateway || defaults.paymentGateway.activeGateway || 'razorpay';

    return {
      ...(dbConfig || {}),
      activeGateway,
      defaultGateway: activeGateway,
      abcgate: {
        apiUrl: defaults.paymentGateway.initiateUrl,
        apiToken: defaults.paymentGateway.apiToken,
        callbackUrl: 'https://api.abcgate.shop/api/callback/upiid',
        ...(dbConfig?.abcgate || {}),
      },
      phonepe: {
        clientId: defaults.phonepe.clientId,
        clientSecret: defaults.phonepe.clientSecret,
        clientVersion: defaults.phonepe.clientVersion,
        env: defaults.phonepe.env,
        callbackUsername: defaults.phonepe.callbackUsername,
        callbackPassword: defaults.phonepe.callbackPassword,
        redirectUrl: defaults.phonepe.redirectUrl,
        ...(dbConfig?.phonepe || {}),
      },
      razorpay: {
        keyId: defaults.razorpay.keyId,
        keySecret: defaults.razorpay.keySecret,
        webhookSecret: defaults.razorpay.webhookSecret,
        ...(dbConfig?.razorpay || {}),
      },
    };
  }

  /**
   * Get or create a PhonePe StandardCheckoutClient instance
   */
  _getPhonePeClient(config) {
    if (!StandardCheckoutClient) {
      throw new Error('PhonePe SDK is not installed. Run: npm install @phonepe-pg/pg-sdk-node');
    }

    const clientId = config.clientId || defaults.phonepe.clientId;
    const clientSecret = config.clientSecret || defaults.phonepe.clientSecret;
    const clientVersion = config.clientVersion || defaults.phonepe.clientVersion;
    const env = (config.env || defaults.phonepe.env || 'SANDBOX').toUpperCase();

    if (!clientId || !clientSecret) {
      throw new Error('PhonePe credentials not configured. Please set client_id and client_secret in admin settings.');
    }

    const phonePeEnv = env === 'PRODUCTION' ? PhonePeEnv.PRODUCTION : PhonePeEnv.SANDBOX;

    // StandardCheckoutClient uses singleton pattern internally
    return StandardCheckoutClient.getInstance(clientId, clientSecret, clientVersion, phonePeEnv);
  }

  /**
   * Get or create a Razorpay instance
   */
  _getRazorpayInstance(config = {}) {
    if (!Razorpay) {
      throw new Error('Razorpay SDK is not installed. Run: npm install razorpay');
    }

    const key_id = config.keyId || defaults.razorpay.keyId;
    const key_secret = config.keySecret || defaults.razorpay.keySecret;

    if (!key_id || !key_secret) {
      throw new Error('Razorpay credentials not configured. Please set keyId and keySecret in admin settings.');
    }

    return new Razorpay({
      key_id,
      key_secret,
    });
  }

  /**
   * Initiate payment with external gateway (ABCGate or PhonePe based on admin setting)
   */
  async initiatePayment({ userId, type, targetId, amount, note, customerName, customerMobile, customerEmail }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const gatewayConfig = await this._getGatewayConfig();
    const activeGateway = gatewayConfig.activeGateway || 'abcgate';

    // Generate unique order ID (alphanumeric, between 8 and 15 characters long)
    const prefix = type === 'SUBSCRIPTION' ? 'SUB' : type === 'VOBIZ_NUMBER' ? 'NUM' : 'ORD';
    const timeStr = Date.now().toString().slice(-6);
    const randStr = crypto.randomBytes(2).toString('hex');
    const orderId = `${prefix}${timeStr}${randStr}`; // 3 + 6 + 4 = 13 characters

    const formattedAmount = String(amount);
    const rawName = String(customerName || user.businessName || user.business_name || 'Merchant');
    const resolvedName = rawName.replace(/[^a-zA-Z\s]/g, '').trim() || 'Merchant';
    const rawMobile = String(customerMobile || user.mobile || user.phoneNumber || '9876543210');
    const cleanDigits = rawMobile.replace(/\D/g, '');
    const resolvedMobile = cleanDigits.length > 10 ? cleanDigits.slice(-10) : cleanDigits || '9876543210';
    const resolvedEmail = customerEmail || user.email || 'demo@gmail.com';
    const resolvedNote = note || `${type} purchase by ${resolvedName}`;

    console.log(`[PaymentService] Initiating payment via ${activeGateway.toUpperCase()} for OrderId: ${orderId}, Amount: ${formattedAmount}, Type: ${type}`);

    let result;
    if (activeGateway === 'phonepe') {
      result = await this._initiatePhonePe({
        orderId, amount: Number(amount), resolvedName, resolvedMobile, resolvedEmail, resolvedNote,
        userId, type, targetId, formattedAmount,
        phonePeConfig: gatewayConfig.phonepe || {},
      });
    } else if (activeGateway === 'razorpay') {
      result = await this._initiateRazorpay({
        orderId, amount: Number(amount), resolvedName, resolvedMobile, resolvedEmail, resolvedNote,
        userId, type, targetId, formattedAmount,
        razorpayConfig: gatewayConfig.razorpay || {},
      });
    } else {
      result = await this._initiateABCGate({
        orderId, formattedAmount, resolvedName, resolvedMobile, resolvedEmail, resolvedNote,
        userId, type, targetId,
        abcConfig: gatewayConfig.abcgate || {},
      });
    }

    return result;
  }

  /**
   * Initiate payment via ABCGate (existing logic)
   */
  async _initiateABCGate({ orderId, formattedAmount, resolvedName, resolvedMobile, resolvedEmail, resolvedNote, userId, type, targetId, abcConfig }) {
    const requestBody = {
      amount: formattedAmount,
      orderId: orderId,
      customer_name: resolvedName,
      customer_mobile: resolvedMobile,
      customer_email: resolvedEmail,
      note: resolvedNote,
    };

    const apiUrl = abcConfig.apiUrl || defaults.paymentGateway.initiateUrl;
    const apiToken = abcConfig.apiToken || defaults.paymentGateway.apiToken;

    let responseData = null;
    try {
      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'api-token': apiToken,
        },
        timeout: 15000,
      });

      responseData = response.data;
    } catch (err) {
      console.error('[PaymentService ABCGate] Payment initiation API error:', err.response?.data || err.message);

      const errorMsg = err.response?.data?.message || err.response?.data?.data?.error?.message || err.message || 'Payment initiation failed';

      // Log failed transaction initiation in database for audit
      await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'failed',
        gateway: 'abcgate',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        rawResponse: err.response?.data || { error: err.message },
      }).catch(() => { });

      throw new Error(errorMsg);
    }

    if (!responseData || responseData.success === false) {
      const errorMsg = responseData?.data?.error?.message || responseData?.message || 'Payment initiation failed';

      await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'failed',
        gateway: 'abcgate',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        rawResponse: responseData,
      }).catch(() => { });

      throw new Error(errorMsg);
    }

    const gatewayData = responseData.data || {};
    const transactionId = gatewayData.transaction_id || null;
    const paymentUrl = gatewayData.payment_url || null;
    const upiString = gatewayData.upiString || null;
    const gateway_type = gatewayData.gateway_type || null;

    // Record pending transaction in DB
    const transaction = await PaymentTransaction.create({
      userId,
      orderId,
      type,
      targetId: String(targetId),
      amount: formattedAmount,
      status: 'pending',
      gateway: 'abcgate',
      customerName: resolvedName,
      customerMobile: resolvedMobile,
      customerEmail: resolvedEmail,
      note: resolvedNote,
      gatewayTransactionId: transactionId,
      paymentUrl,
      upiString,
      rawResponse: responseData,
    });

    return {
      success: true,
      message: responseData.message || 'Payment initiated successfully',
      data: {
        success: true,
        gateway: 'abcgate',
        transaction_id: transactionId,
        payment_url: paymentUrl,
        order_id: orderId,
        amount: formattedAmount,
        upiString: upiString,
        gateway_type: gateway_type,
        timestamp: gatewayData.timestamp || new Date().toISOString(),
        paymentTransactionId: transaction.id,
      },
    };
  }

  /**
   * Initiate payment via PhonePe Standard Checkout
   * Amount is converted from rupees to paise (PhonePe requires paise)
   */
  async _initiatePhonePe({ orderId, amount, resolvedName, resolvedMobile, resolvedEmail, resolvedNote, userId, type, targetId, formattedAmount, phonePeConfig }) {
    try {
      const client = this._getPhonePeClient(phonePeConfig);
      const redirectUrl = phonePeConfig.redirectUrl || defaults.phonepe.redirectUrl;

      // PhonePe requires amount in paise (1 INR = 100 paise)
      const amountInPaise = Math.round(amount * 100);

      const request = StandardCheckoutPayRequest.builder()
        .merchantOrderId(orderId)
        .amount(amountInPaise)
        .redirectUrl(redirectUrl)
        .build();

      const response = await client.pay(request);

      const checkoutPageUrl = response.redirectUrl || response.checkoutPageUrl || null;
      const phonePeOrderId = response.orderId || response.merchantOrderId || orderId;

      // Record pending transaction in DB
      const transaction = await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'pending',
        gateway: 'phonepe',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        gatewayTransactionId: phonePeOrderId,
        paymentUrl: checkoutPageUrl,
        rawResponse: response,
      });

      console.log(`[PaymentService PhonePe] Payment initiated. OrderId: ${orderId}, CheckoutURL: ${checkoutPageUrl}`);

      return {
        success: true,
        message: 'Payment initiated successfully via PhonePe',
        data: {
          success: true,
          gateway: 'phonepe',
          transaction_id: phonePeOrderId,
          payment_url: checkoutPageUrl,
          order_id: orderId,
          amount: formattedAmount,
          upiString: null,
          gateway_type: 'phonepe',
          timestamp: new Date().toISOString(),
          paymentTransactionId: transaction.id,
        },
      };
    } catch (err) {
      console.error('[PaymentService PhonePe] Payment initiation error:', err.message);

      // Log failed transaction
      await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'failed',
        gateway: 'phonepe',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        rawResponse: { error: err.message },
      }).catch(() => { });

      throw new Error(err.message || 'PhonePe payment initiation failed');
    }
  }

  /**
   * Initiate payment via Razorpay Orders API
   * Amount is converted from rupees to paise (Razorpay requires paise)
   */
  async _initiateRazorpay({ orderId, amount, resolvedName, resolvedMobile, resolvedEmail, resolvedNote, userId, type, targetId, formattedAmount, razorpayConfig }) {
    try {
      const rzp = this._getRazorpayInstance(razorpayConfig);

      // Razorpay requires amount in paise (1 INR = 100 paise)
      const amountInPaise = Math.round(Number(amount) * 100);

      const notes = {
        orderId,
        userId: String(userId),
        type,
        targetId: String(targetId),
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
      };

      const orderOptions = {
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderId, // Max 40 chars; orderId is 13 chars
        notes,
      };

      const rzpOrder = await rzp.orders.create(orderOptions);

      // Record pending transaction in DB
      const transaction = await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'pending',
        gateway: 'razorpay',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        gatewayTransactionId: rzpOrder.id, // Razorpay Order ID (e.g. order_xxx)
        paymentUrl: null,
        rawResponse: rzpOrder,
      });

      console.log(`[PaymentService Razorpay] Order created. InternalOrderId: ${orderId}, RazorpayOrderId: ${rzpOrder.id}, Amount: ${amountInPaise} paise`);

      return {
        success: true,
        message: 'Payment initiated successfully via Razorpay',
        data: {
          success: true,
          gateway: 'razorpay',
          order_id: orderId,
          razorpay_order_id: rzpOrder.id,
          amount: formattedAmount,
          amount_paise: amountInPaise,
          currency: rzpOrder.currency || 'INR',
          key_id: razorpayConfig.keyId || defaults.razorpay.keyId,
          customer_name: resolvedName,
          customer_email: resolvedEmail,
          customer_mobile: resolvedMobile,
          notes,
          timestamp: new Date().toISOString(),
          paymentTransactionId: transaction.id,
        },
      };
    } catch (err) {
      console.error('[PaymentService Razorpay] Payment initiation error:', err.message);

      // Log failed transaction
      await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'failed',
        gateway: 'razorpay',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        rawResponse: { error: err.message },
      }).catch(() => {});

      throw new Error(err.message || 'Razorpay payment initiation failed');
    }
  }

  /**
   * Check PhonePe order status using SDK
   */
  async checkPhonePeOrderStatus(merchantOrderId) {
    const gatewayConfig = await this._getGatewayConfig();
    const client = this._getPhonePeClient(gatewayConfig.phonepe || {});

    const statusResponse = await client.getOrderStatus(merchantOrderId);
    return statusResponse;
  }

  /**
   * Validate and process PhonePe S2S webhook callback
   */
  async processPhonePeWebhook(headers, body) {
    console.log('[PaymentService] Received PhonePe webhook');

    const gatewayConfig = await this._getGatewayConfig();
    const phonePeConfig = gatewayConfig.phonepe || {};
    const client = this._getPhonePeClient(phonePeConfig);

    const authHeader = headers['authorization'] || headers['Authorization'] || '';
    const username = phonePeConfig.callbackUsername || defaults.phonepe.callbackUsername;
    const password = phonePeConfig.callbackPassword || defaults.phonepe.callbackPassword;
    const bodyString = typeof body === 'string' ? body : JSON.stringify(body);

    let callbackResponse;
    try {
      callbackResponse = client.validateCallback(username, password, authHeader, bodyString);
      console.log('[PaymentService PhonePe] Callback validated successfully');
    } catch (validationErr) {
      console.error('[PaymentService PhonePe] Callback validation failed:', validationErr.message);
      throw new Error('PhonePe callback validation failed: ' + validationErr.message);
    }

    // Extract payment details from callback
    const payload = callbackResponse?.payload || callbackResponse || {};
    const merchantOrderId = payload.merchantOrderId || payload.merchantTransactionId || null;
    const state = (payload.state || payload.status || '').toUpperCase();

    if (!merchantOrderId) {
      console.warn('[PaymentService PhonePe] No merchantOrderId in callback payload');
      return { success: false, message: 'Missing merchantOrderId in callback' };
    }

    const tx = await PaymentTransaction.findOne({ where: { orderId: merchantOrderId } });
    if (!tx) {
      console.warn(`[PaymentService PhonePe] Transaction not found for orderId: ${merchantOrderId}`);
      return { success: false, message: `Transaction not found for orderId: ${merchantOrderId}` };
    }

    // Save raw webhook data
    tx.rawWebhookData = { headers: { authorization: authHeader }, body: typeof body === 'string' ? JSON.parse(body) : body, parsed: payload };

    if (tx.status === 'success') {
      console.log(`[PaymentService PhonePe] OrderId ${merchantOrderId} already processed as success.`);
      await tx.save();
      return { success: true, message: 'Transaction already completed', data: { orderId: merchantOrderId, status: tx.status } };
    }

    const isSuccess = state === 'COMPLETED' || state === 'SUCCESS';

    if (isSuccess) {
      tx.status = 'success';
      await tx.save();

      console.log(`[PaymentService PhonePe] OrderId ${merchantOrderId} marked SUCCESS. Fulfilling ${tx.type}...`);

      try {
        if (tx.type === 'SUBSCRIPTION') {
          await this._fulfillSubscriptionPurchase(tx);
        } else if (tx.type === 'VOBIZ_NUMBER') {
          await this._fulfillVobizNumberPurchase(tx);
        }
      } catch (fulfillErr) {
        console.error(`[PaymentService PhonePe] Fulfillment error for orderId ${merchantOrderId}:`, fulfillErr);
      }

      return {
        success: true,
        message: 'PhonePe payment processed and service fulfilled',
        data: { orderId: merchantOrderId, status: 'success' },
      };
    } else {
      tx.status = 'failed';
      await tx.save();

      console.log(`[PaymentService PhonePe] OrderId ${merchantOrderId} marked FAILED (state: ${state}).`);
      return {
        success: true,
        message: 'PhonePe payment marked as failed',
        data: { orderId: merchantOrderId, status: 'failed' },
      };
    }
  }

  /**
   * Handle PhonePe redirect (user lands back after payment)
   * Checks status via SDK and redirects or returns JSON
   */
  async handlePhonePeRedirect(merchantOrderId) {
    if (!merchantOrderId) {
      return { success: false, status: 'unknown', message: 'No order ID provided' };
    }

    const tx = await PaymentTransaction.findOne({ where: { orderId: merchantOrderId } });
    if (!tx) {
      return { success: false, status: 'unknown', message: 'Transaction not found' };
    }

    // If already processed via webhook, return current status
    if (tx.status === 'success' || tx.status === 'failed') {
      return { success: true, status: tx.status, orderId: merchantOrderId };
    }

    // Otherwise check with PhonePe API
    try {
      const statusResponse = await this.checkPhonePeOrderStatus(merchantOrderId);
      const state = (statusResponse?.state || statusResponse?.status || '').toUpperCase();
      const isSuccess = state === 'COMPLETED' || state === 'SUCCESS';

      tx.status = isSuccess ? 'success' : (state === 'PENDING' ? 'pending' : 'failed');
      tx.rawWebhookData = { ...tx.rawWebhookData, statusCheck: statusResponse };
      await tx.save();

      if (isSuccess && tx.status === 'success') {
        try {
          if (tx.type === 'SUBSCRIPTION') {
            await this._fulfillSubscriptionPurchase(tx);
          } else if (tx.type === 'VOBIZ_NUMBER') {
            await this._fulfillVobizNumberPurchase(tx);
          }
        } catch (fulfillErr) {
          console.error(`[PaymentService PhonePe Redirect] Fulfillment error:`, fulfillErr);
        }
      }

      return { success: true, status: tx.status, orderId: merchantOrderId, state };
    } catch (err) {
      console.error('[PaymentService PhonePe Redirect] Status check error:', err.message);
      return { success: false, status: tx.status, orderId: merchantOrderId, error: err.message };
    }
  }

  /**
   * Verify Razorpay payment signature & finalize fulfillment
   * Called after customer completes payment in Razorpay modal / checkout
   */
  async processRazorpayVerification({ orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature, userId }) {
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      throw new Error('razorpay_order_id, razorpay_payment_id, and razorpay_signature are required for verification');
    }

    const gatewayConfig = await this._getGatewayConfig();
    const razorpayConfig = gatewayConfig.razorpay || {};
    const keySecret = razorpayConfig.keySecret || defaults.razorpay.keySecret;

    if (!keySecret) {
      throw new Error('Razorpay keySecret not configured');
    }

    // Verify signature: HMAC-SHA256 of (razorpay_order_id + "|" + razorpay_payment_id) using keySecret
    let isValid = false;
    if (validatePaymentVerification) {
      try {
        isValid = validatePaymentVerification(
          { order_id: razorpay_order_id, payment_id: razorpay_payment_id },
          razorpay_signature,
          keySecret
        );
      } catch (verifErr) {
        console.warn('[PaymentService Razorpay] validatePaymentVerification warning, using manual HMAC:', verifErr.message);
      }
    }

    if (!isValid) {
      const generatedSignature = crypto
        .createHmac('sha256', keySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');
      isValid = generatedSignature === razorpay_signature;
    }

    if (!isValid) {
      throw new Error('Invalid Razorpay payment signature');
    }

    // Find transaction by internal orderId or Razorpay order id (gatewayTransactionId)
    const whereClause = {};
    if (orderId) {
      whereClause.orderId = orderId;
    } else {
      whereClause.gatewayTransactionId = razorpay_order_id;
    }

    if (userId) {
      whereClause.userId = userId;
    }

    let tx = await PaymentTransaction.findOne({ where: whereClause });

    // Fallback: If not found by primary whereClause, try by gatewayTransactionId
    if (!tx && orderId) {
      tx = await PaymentTransaction.findOne({
        where: {
          gatewayTransactionId: razorpay_order_id,
          ...(userId ? { userId } : {}),
        },
      });
    }

    if (!tx) {
      throw new Error(`Transaction record not found for Razorpay order: ${razorpay_order_id}`);
    }

    // Check if already fulfilled (idempotency)
    if (tx.status === 'success') {
      console.log(`[PaymentService Razorpay] Order ${tx.orderId} already completed.`);
      return {
        success: true,
        message: 'Payment already verified and completed',
        data: {
          orderId: tx.orderId,
          razorpay_order_id,
          razorpay_payment_id,
          status: 'success',
          type: tx.type,
          amount: tx.amount,
        },
      };
    }

    // Optionally fetch payment details from Razorpay to confirm capture & details
    let paymentDetails = null;
    try {
      const rzp = this._getRazorpayInstance(razorpayConfig);
      paymentDetails = await rzp.payments.fetch(razorpay_payment_id);
    } catch (fetchErr) {
      console.warn(`[PaymentService Razorpay] Could not fetch payment details for ${razorpay_payment_id}:`, fetchErr.message);
    }

    // Update transaction to success
    tx.status = 'success';
    tx.gatewayTransactionId = razorpay_payment_id;
    tx.rawWebhookData = {
      ...(tx.rawWebhookData || {}),
      verification: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        paymentDetails,
      },
    };
    await tx.save();

    console.log(`[PaymentService Razorpay] Order ${tx.orderId} verified SUCCESS. Fulfilling ${tx.type}...`);

    try {
      if (tx.type === 'SUBSCRIPTION') {
        await this._fulfillSubscriptionPurchase(tx);
      } else if (tx.type === 'VOBIZ_NUMBER') {
        await this._fulfillVobizNumberPurchase(tx);
      }
    } catch (fulfillErr) {
      console.error(`[PaymentService Razorpay] Fulfillment error for orderId ${tx.orderId}:`, fulfillErr);
    }

    return {
      success: true,
      message: 'Razorpay payment verified and fulfilled successfully',
      data: {
        orderId: tx.orderId,
        razorpay_order_id,
        razorpay_payment_id,
        status: 'success',
        type: tx.type,
        amount: tx.amount,
      },
    };
  }

  /**
   * Validate and process Razorpay Webhook events
   * Handles payment.captured, order.paid, payment.failed
   */
  async processRazorpayWebhook(headers, body) {
    console.log('[PaymentService] Received Razorpay webhook');

    const signature = headers['x-razorpay-signature'] || headers['X-Razorpay-Signature'];
    const gatewayConfig = await this._getGatewayConfig();
    const razorpayConfig = gatewayConfig.razorpay || {};
    const configuredSecret = razorpayConfig.webhookSecret || defaults.razorpay.webhookSecret;

    // Check if a real webhook secret is configured (skip if placeholder, empty, or not set)
    const hasSecret = configuredSecret &&
      configuredSecret !== 'your_razorpay_webhook_secret' &&
      configuredSecret.trim().length > 0;

    const bodyString = Buffer.isBuffer(body)
      ? body.toString('utf8')
      : (typeof body === 'string' ? body : JSON.stringify(body));

    if (hasSecret && signature) {
      let isValid = false;
      if (validateWebhookSignature) {
        try {
          isValid = validateWebhookSignature(bodyString, signature, configuredSecret);
        } catch (valErr) {
          console.warn('[PaymentService Razorpay] validateWebhookSignature warning, using manual HMAC:', valErr.message);
        }
      }

      if (!isValid) {
        const expectedSignature = crypto
          .createHmac('sha256', configuredSecret)
          .update(bodyString)
          .digest('hex');
        isValid = expectedSignature === signature;
      }

      if (!isValid) {
        throw new Error('Invalid Razorpay webhook signature');
      }
      console.log('[PaymentService Razorpay] Webhook signature verified successfully.');
    } else {
      console.log('[PaymentService Razorpay] Webhook secret validation skipped (no webhook secret configured).');
    }

    const parsed = typeof body === 'object' && !Buffer.isBuffer(body) ? body : JSON.parse(bodyString);
    const event = parsed.event;
    const payload = parsed.payload || {};

    console.log(`[PaymentService Razorpay] Processing event: ${event}`);

    // Extract order/payment info depending on event
    const paymentEntity = payload.payment?.entity;
    const orderEntity = payload.order?.entity;

    const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
    const razorpayPaymentId = paymentEntity?.id;
    const receiptOrderId = orderEntity?.receipt || paymentEntity?.notes?.orderId || orderEntity?.notes?.orderId;

    // Find transaction in DB
    let tx = null;
    if (receiptOrderId) {
      tx = await PaymentTransaction.findOne({ where: { orderId: receiptOrderId } });
    }
    if (!tx && razorpayOrderId) {
      tx = await PaymentTransaction.findOne({ where: { gatewayTransactionId: razorpayOrderId } });
    }
    if (!tx && razorpayPaymentId) {
      tx = await PaymentTransaction.findOne({ where: { gatewayTransactionId: razorpayPaymentId } });
    }

    if (!tx) {
      console.warn(`[PaymentService Razorpay Webhook] No matching transaction found for order: ${razorpayOrderId}, receipt: ${receiptOrderId}`);
      return { success: false, message: 'Transaction not found for webhook event' };
    }

    tx.rawWebhookData = {
      ...(tx.rawWebhookData || {}),
      webhook: parsed,
    };

    if (event === 'payment.captured' || event === 'order.paid') {
      if (tx.status === 'success') {
        console.log(`[PaymentService Razorpay Webhook] OrderId ${tx.orderId} already completed.`);
        await tx.save();
        return { success: true, message: 'Transaction already completed', data: { orderId: tx.orderId, status: tx.status } };
      }

      tx.status = 'success';
      if (razorpayPaymentId) {
        tx.gatewayTransactionId = razorpayPaymentId;
      }
      await tx.save();

      console.log(`[PaymentService Razorpay Webhook] OrderId ${tx.orderId} marked SUCCESS. Fulfilling ${tx.type}...`);

      try {
        if (tx.type === 'SUBSCRIPTION') {
          await this._fulfillSubscriptionPurchase(tx);
        } else if (tx.type === 'VOBIZ_NUMBER') {
          await this._fulfillVobizNumberPurchase(tx);
        }
      } catch (fulfillErr) {
        console.error(`[PaymentService Razorpay Webhook] Fulfillment error for orderId ${tx.orderId}:`, fulfillErr);
      }

      return {
        success: true,
        message: 'Razorpay webhook processed and service fulfilled',
        data: { orderId: tx.orderId, status: 'success' },
      };
    } else if (event === 'payment.failed') {
      tx.status = 'failed';
      await tx.save();

      console.log(`[PaymentService Razorpay Webhook] OrderId ${tx.orderId} marked FAILED.`);
      return {
        success: true,
        message: 'Razorpay payment marked as failed',
        data: { orderId: tx.orderId, status: 'failed' },
      };
    }

    await tx.save();
    return {
      success: true,
      message: `Webhook event ${event} recorded`,
      data: { orderId: tx.orderId, event },
    };
  }

  /**
   * Check Razorpay payment status by orderId using Razorpay API
   */
  async checkRazorpayOrderStatus(orderId, userId = null) {
    const whereClause = { orderId };
    if (userId) {
      whereClause.userId = userId;
    }

    const tx = await PaymentTransaction.findOne({ where: whereClause });
    if (!tx) {
      throw new Error(`Transaction not found for orderId: ${orderId}`);
    }

    const gatewayConfig = await this._getGatewayConfig();
    const razorpayConfig = gatewayConfig.razorpay || {};
    const rzp = this._getRazorpayInstance(razorpayConfig);

    let razorpayOrder = null;
    let payments = [];

    // If gatewayTransactionId has an order ID (starts with order_)
    if (tx.gatewayTransactionId && tx.gatewayTransactionId.startsWith('order_')) {
      try {
        razorpayOrder = await rzp.orders.fetch(tx.gatewayTransactionId);
        const paymentsResponse = await rzp.orders.fetchPayments(tx.gatewayTransactionId);
        payments = paymentsResponse?.items || [];
      } catch (err) {
        console.warn(`[PaymentService Razorpay] Failed to fetch order ${tx.gatewayTransactionId}:`, err.message);
      }
    } else if (tx.gatewayTransactionId && tx.gatewayTransactionId.startsWith('pay_')) {
      try {
        const payment = await rzp.payments.fetch(tx.gatewayTransactionId);
        payments = [payment];
        if (payment.order_id) {
          razorpayOrder = await rzp.orders.fetch(payment.order_id);
        }
      } catch (err) {
        console.warn(`[PaymentService Razorpay] Failed to fetch payment ${tx.gatewayTransactionId}:`, err.message);
      }
    }

    // Check if any payment is captured
    const capturedPayment = payments.find(p => p.status === 'captured');
    if (capturedPayment && tx.status !== 'success') {
      tx.status = 'success';
      tx.gatewayTransactionId = capturedPayment.id;
      await tx.save();

      console.log(`[PaymentService Razorpay Status] Order ${tx.orderId} verified captured. Fulfilling ${tx.type}...`);
      try {
        if (tx.type === 'SUBSCRIPTION') {
          await this._fulfillSubscriptionPurchase(tx);
        } else if (tx.type === 'VOBIZ_NUMBER') {
          await this._fulfillVobizNumberPurchase(tx);
        }
      } catch (fulfillErr) {
        console.error(`[PaymentService Razorpay Status] Fulfillment error:`, fulfillErr);
      }
    }

    return {
      orderId: tx.orderId,
      status: tx.status,
      type: tx.type,
      amount: tx.amount,
      targetId: tx.targetId,
      gateway: tx.gateway,
      razorpayOrder,
      payments,
    };
  }

  /**
   * Process webhook events (PAYIN) — ABCGate
   */
  async processWebhook(payload) {
    console.log('[PaymentService] Received webhook payload:', JSON.stringify(payload));

    const { event_type, data } = payload || {};

    if (event_type !== 'PAYIN') {
      console.log(`[PaymentService Webhook] Ignoring non-PAYIN event type: ${event_type}`);
      return { success: true, message: `Ignored non-PAYIN event type: ${event_type}` };
    }

    if (!data) {
      throw new Error('Missing data object in webhook payload');
    }

    const { order_id, status, amount, urn_number } = data;

    if (!order_id) {
      throw new Error('Missing order_id in webhook payload data');
    }

    const tx = await PaymentTransaction.findOne({ where: { orderId: order_id } });
    if (!tx) {
      console.warn(`[PaymentService Webhook] Transaction not found for orderId: ${order_id}`);
      return { success: false, message: `Transaction record not found for order_id: ${order_id}` };
    }

    // Update raw webhook payload and URN
    tx.rawWebhookData = payload;
    if (urn_number) tx.urnNumber = urn_number;

    if (tx.status === 'success') {
      console.log(`[PaymentService Webhook] OrderId ${order_id} already processed as success.`);
      await tx.save();
      return { success: true, message: 'Transaction already completed', data: { orderId: order_id, status: tx.status } };
    }

    const isSuccess = String(status || '').toLowerCase() === 'success';

    if (isSuccess) {
      tx.status = 'success';
      await tx.save();

      console.log(`[PaymentService Webhook] OrderId ${order_id} marked SUCCESS. Fulfilling ${tx.type} (target: ${tx.targetId})...`);

      // Fulfill purchase
      try {
        if (tx.type === 'SUBSCRIPTION') {
          await this._fulfillSubscriptionPurchase(tx);
        } else if (tx.type === 'VOBIZ_NUMBER') {
          await this._fulfillVobizNumberPurchase(tx);
        }
      } catch (fulfillErr) {
        console.error(`[PaymentService Webhook] Fulfillment error for orderId ${order_id}:`, fulfillErr);
      }

      return {
        success: true,
        message: 'Payment processed and service fulfilled successfully',
        data: { orderId: order_id, status: 'success' },
      };
    } else {
      tx.status = 'failed';
      await tx.save();

      console.log(`[PaymentService Webhook] OrderId ${order_id} marked FAILED.`);
      return {
        success: true,
        message: 'Payment marked as failed',
        data: { orderId: order_id, status: 'failed' },
      };
    }
  }

  /**
   * App Callback / Direct Webhook completion
   * Updates local transaction status & forwards callback to ABC Gate (https://api.abcgate.shop/api/callback/upiid)
   */
  async completePaymentAppCallback({ order_id, status, amount, urn_number }) {
    if (!order_id) {
      throw new Error('Missing order_id in request payload');
    }

    const tx = await PaymentTransaction.findOne({ where: { orderId: order_id } });
    if (!tx) {
      throw new Error(`Transaction record not found for order_id: ${order_id}`);
    }

    const resolvedAmount = amount || tx.amount;
    const isSuccess = String(status || '').toLowerCase() === 'success';
    const finalStatus = isSuccess ? 'success' : 'failed';

    if (urn_number) {
      tx.urnNumber = urn_number;
    }

    tx.status = finalStatus;
    await tx.save();

    if (isSuccess) {
      console.log(`[PaymentService AppCallback] OrderId ${order_id} marked SUCCESS. Fulfilling ${tx.type} (target: ${tx.targetId})...`);
      try {
        if (tx.type === 'SUBSCRIPTION') {
          await this._fulfillSubscriptionPurchase(tx);
        } else if (tx.type === 'VOBIZ_NUMBER') {
          await this._fulfillVobizNumberPurchase(tx);
        }
      } catch (fulfillErr) {
        console.error(`[PaymentService AppCallback] Fulfillment error for orderId ${order_id}:`, fulfillErr);
      }
    } else {
      console.log(`[PaymentService AppCallback] OrderId ${order_id} marked FAILED.`);
    }

    await tx.save();

    // Send callback to ABC Gate for both success & failed payments (only for ABCGate transactions)
    let abcGateCallbackSuccess = false;
    if (tx.gateway === 'abcgate' || !tx.gateway) {
      try {
        const gatewayConfig = await this._getGatewayConfig();
        const abcConfig = gatewayConfig.abcgate || {};
        const apiKey = abcConfig.apiToken || defaults.paymentGateway.apiToken;
        const callbackUrl = abcConfig.callbackUrl || 'https://api.abcgate.shop/api/callback/upiid';

        const response = await axios.post(
          callbackUrl,
          {
            orderId: order_id,
            amount: String(resolvedAmount),
            rrn: urn_number || null,
            status: isSuccess ? "success" : "failed",
          },
          {
            headers: {
              "Content-Type": "application/json",
              "api-token": apiKey,
            },
            timeout: 10000,
          }
        );

        console.log(`ABC Gate callback sent for ${order_id}:`, response.data);
        abcGateCallbackSuccess = true;
      } catch (callbackError) {
        console.error(
          "ABC Gate callback failed:",
          callbackError.response?.data || callbackError.message
        );
      }
    }

    return {
      success: true,
      message: `Payment callback processed successfully (status: ${finalStatus})`,
      data: {
        orderId: order_id,
        status: finalStatus,
        gateway: tx.gateway || 'abcgate',
        abcGateCallbackSent: abcGateCallbackSuccess,
      },
    };
  }

  /**
   * Helper: Fulfill subscription upgrade after successful payment
   */
  async _fulfillSubscriptionPurchase(tx) {
    const planId = tx.targetId;
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      console.error(`[Fulfill Subscription] Target plan ${planId} not found in DB`);
      return;
    }

    let subscription = await Subscription.findOne({ where: { userId: tx.userId } });
    const previousPlanId = subscription ? subscription.planId : null;
    const previousPlanName = subscription ? subscription.activePlan : null;
    const prevCallsUsed = subscription ? subscription.callsUsed : 0;

    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(now.getMonth() + 1);

    const callLimitVal = plan.callLimit === -1 ? 999999 : plan.callLimit;

    if (!subscription) {
      subscription = await Subscription.create({
        userId: tx.userId,
        planId: plan.id,
        activePlan: plan.name,
        startDate: now,
        expiryDate,
        callsUsed: 0,
        callsRemaining: callLimitVal,
        status: 'active',
      });
    } else {
      await subscription.update({
        planId: plan.id,
        activePlan: plan.name,
        startDate: now,
        expiryDate,
        callsRemaining: callLimitVal, // Do not carry forward old calls
        status: 'active',
      });
    }

    await removeTrialDemoNumber(tx.userId).catch(() => { });

    // Record upgrade history
    await SubscriptionHistory.create({
      userId: tx.userId,
      adminId: null,
      previousPlanId,
      previousPlanName,
      newPlanId: plan.id,
      newPlanName: plan.name,
      actionType: 'MERCHANT_PURCHASE',
      startDate: now,
      expiryDate,
      callsLimit: callLimitVal,
      callsUsed: prevCallsUsed,
      notes: `Subscribed to ${plan.name} via payment (Order: ${tx.orderId})`,
    }).catch((err) => console.error('[SubscriptionHistory] Error logging online purchase history:', err));

    console.log(`[Fulfill Subscription] Successfully upgraded user ${tx.userId} to ${plan.name} plan.`);

    // Notifications
    await NotificationService.notifyMerchant(tx.userId, 'Payment Completed', `Your payment for the ${plan.name} plan was successful.`, 'payments');
    await NotificationService.notifyAdmin('Plan Upgraded', `Merchant (User ID: ${tx.userId}) upgraded to the ${plan.name} plan.`, null, 'payments');
  }

  /**
   * Helper: Fulfill VoBiz phone number purchase after successful payment
   */
  async _fulfillVobizNumberPurchase(tx) {
    const [number, setupFeeStr, monthlyFeeStr] = tx.targetId.split('|');

    // Check if number already registered
    const existing = await VobizNumber.findOne({ where: { userId: tx.userId, number } });
    if (existing) {
      let nextExpiry = new Date(existing.rentalExpiryDate || new Date());
      if (nextExpiry < new Date()) {
        nextExpiry = new Date();
      }
      nextExpiry.setMonth(nextExpiry.getMonth() + 1);

      await existing.update({
        status: 'active',
        rentalExpiryDate: nextExpiry
      });
      console.log(`[Fulfill VoBiz Number] Number ${number} already registered for user ${tx.userId}. Activated and extended until ${nextExpiry}.`);
      return;
    }

    let purchaseResult = { purchasedVia: 'payment_gateway' };

    // Check if merchant has sub-account to assign
    const account = await VobizAccount.findOne({ where: { userId: tx.userId } });

    try {
      purchaseResult = await vobizService.buyNumber(number);
      if (account && account.customerId) {
        await vobizService.assignNumberToSubAccount(number, account.customerId);
      }
    } catch (vobizErr) {
      console.warn(`[Fulfill VoBiz Number] VoBiz API buy/assign warning: ${vobizErr.message}`);
    }

    if (account) {
      try {
        const encryptEnabled = defaults.vobiz.encryptCredentials;
        const decryptedApiSecret = encryptEnabled ? decrypt(account.apiSecret) : account.apiSecret;

        await vobizService.setupInboundRouting({
          authId: account.customerId,
          authToken: decryptedApiSecret,
          number: number,
        });
      } catch (routingErr) {
        console.warn(`[Fulfill VoBiz Number] Inbound routing setup warning: ${routingErr.message}`);
      }
    }

    const rentalExpiryDate = new Date();
    rentalExpiryDate.setMonth(rentalExpiryDate.getMonth() + 1);

    const providerData = purchaseResult || {};
    if (setupFeeStr !== undefined) providerData.monthlyFee = parseInt(monthlyFeeStr, 10);
    if (setupFeeStr !== undefined) providerData.setupFee = parseInt(setupFeeStr, 10);

    await VobizNumber.create({
      userId: tx.userId,
      number: number,
      status: 'active',
      rentalExpiryDate,
      providerData,
    });

    console.log(`[Fulfill VoBiz Number] Number ${number} purchased and added for user ${tx.userId} with expiry ${rentalExpiryDate}.`);

    // Notifications
    await NotificationService.notifyMerchant(tx.userId, 'Payment Completed', `Your payment for VoBiz number ${number} was successful.`, 'payments');
    await NotificationService.notifyAdmin('Number Purchased', `Merchant (User ID: ${tx.userId}) purchased a new VoBiz number: ${number}.`, null, 'payments');
  }
}

module.exports = new PaymentService();
