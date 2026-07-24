const axios = require('axios');
const crypto = require('crypto');
const defaults = require('../config/defaults');
const { PaymentTransaction, User, Plan, Subscription, VobizAccount, VobizNumber } = require('../models');
const vobizService = require('./vobizService');
const { removeTrialDemoNumber } = require('./trialDemoNumberService');
const { decrypt } = require('../utils/crypto');

class PaymentService {
  /**
   * Initiate payment with external gateway
   */
  async initiatePayment({ userId, type, targetId, amount, note, customerName, customerMobile, customerEmail }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

    // Generate unique order ID
    const prefix = type === 'SUBSCRIPTION' ? 'SUB' : type === 'VOBIZ_NUMBER' ? 'NUM' : 'ORD';
    const orderId = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const formattedAmount = String(amount);
    const resolvedName = customerName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.businessName || 'Customer';
    const resolvedMobile = customerMobile || user.mobile || user.phoneNumber || '9876543210';
    const resolvedEmail = customerEmail || user.email || 'demo@gmail.com';
    const resolvedNote = note || `${type} purchase by ${resolvedName}`;

    const requestBody = {
      amount: formattedAmount,
      orderId: orderId,
      customer_name: resolvedName,
      customer_mobile: resolvedMobile,
      customer_email: resolvedEmail,
      note: resolvedNote,
    };

    let responseData = null;
    try {
      console.log(`[PaymentService] Initiating payment request for OrderId: ${orderId}, Amount: ${formattedAmount}, Type: ${type}`);

      const response = await axios.post(defaults.paymentGateway.initiateUrl, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          'api-token': defaults.paymentGateway.apiToken,
        },
        timeout: 15000,
      });

      responseData = response.data;
    } catch (err) {
      console.error('[PaymentService] Payment initiation API error:', err.response?.data || err.message);
      
      const errorMsg = err.response?.data?.message || err.response?.data?.data?.error?.message || err.message || 'Payment initiation failed';
      
      // Log failed transaction initiation in database for audit
      await PaymentTransaction.create({
        userId,
        orderId,
        type,
        targetId: String(targetId),
        amount: formattedAmount,
        status: 'failed',
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        rawResponse: err.response?.data || { error: err.message },
      }).catch(() => {});

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
        customerName: resolvedName,
        customerMobile: resolvedMobile,
        customerEmail: resolvedEmail,
        note: resolvedNote,
        rawResponse: responseData,
      }).catch(() => {});

      throw new Error(errorMsg);
    }

    const gatewayData = responseData.data || {};
    const transactionId = gatewayData.transaction_id || null;
    const paymentUrl = gatewayData.payment_url || null;
    const upiString = gatewayData.upiString || null;

    // Record pending transaction in DB
    const transaction = await PaymentTransaction.create({
      userId,
      orderId,
      type,
      targetId: String(targetId),
      amount: formattedAmount,
      status: 'pending',
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
        transaction_id: transactionId,
        payment_url: paymentUrl,
        order_id: orderId,
        amount: formattedAmount,
        upiString: upiString,
        timestamp: gatewayData.timestamp || new Date().toISOString(),
        paymentTransactionId: transaction.id,
      },
    };
  }

  /**
   * Process webhook events (PAYIN)
   */
  async processWebhook(payload) {
    console.log('[PaymentService] Received webhook payload:', JSON.stringify(payload));

    const eventType = payload.event_type || 'PAYIN';
    const data = payload.data || payload;

    const orderId = data.order_id || data.orderId || payload.order_id || payload.orderId;
    const rawStatus = (data.status || payload.status || '').toLowerCase();
    const urnNumber = data.urn_number || data.urnNumber || null;

    if (!orderId) {
      throw new Error('Missing order_id in webhook payload');
    }

    const tx = await PaymentTransaction.findOne({ where: { orderId } });
    if (!tx) {
      console.warn(`[PaymentService Webhook] Transaction not found for orderId: ${orderId}`);
      return { success: false, message: `Transaction record not found for order_id: ${orderId}` };
    }

    // Update raw webhook payload and URN
    tx.rawWebhookData = payload;
    if (urnNumber) tx.urnNumber = urnNumber;

    if (tx.status === 'success') {
      console.log(`[PaymentService Webhook] OrderId ${orderId} already processed as success.`);
      await tx.save();
      return { success: true, message: 'Transaction already completed', data: { orderId, status: tx.status } };
    }

    const isSuccess = rawStatus === 'success';

    if (isSuccess) {
      tx.status = 'success';
      await tx.save();

      console.log(`[PaymentService Webhook] OrderId ${orderId} marked SUCCESS. Fulfilling ${tx.type} (target: ${tx.targetId})...`);

      // Fulfill purchase
      try {
        if (tx.type === 'SUBSCRIPTION') {
          await this._fulfillSubscriptionPurchase(tx);
        } else if (tx.type === 'VOBIZ_NUMBER') {
          await this._fulfillVobizNumberPurchase(tx);
        }
      } catch (fulfillErr) {
        console.error(`[PaymentService Webhook] Fulfillment error for orderId ${orderId}:`, fulfillErr);
      }

      return {
        success: true,
        message: 'Payment processed and service fulfilled successfully',
        data: { orderId, status: 'success' },
      };
    } else {
      tx.status = 'failed';
      await tx.save();

      console.log(`[PaymentService Webhook] OrderId ${orderId} marked FAILED.`);
      return {
        success: true,
        message: 'Payment marked as failed',
        data: { orderId, status: 'failed' },
      };
    }
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
        callsRemaining: callLimitVal,
        status: 'active',
      });
    }

    await removeTrialDemoNumber(tx.userId).catch(() => {});
    console.log(`[Fulfill Subscription] Successfully upgraded user ${tx.userId} to ${plan.name} plan.`);
  }

  /**
   * Helper: Fulfill VoBiz phone number purchase after successful payment
   */
  async _fulfillVobizNumberPurchase(tx) {
    const number = tx.targetId;

    // Check if number already registered
    const existing = await VobizNumber.findOne({ where: { userId: tx.userId, number } });
    if (existing) {
      if (existing.status !== 'active') {
        await existing.update({ status: 'active' });
      }
      console.log(`[Fulfill VoBiz Number] Number ${number} already registered for user ${tx.userId}. Activated.`);
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

    await VobizNumber.create({
      userId: tx.userId,
      number: number,
      status: 'active',
      providerData: purchaseResult,
    });

    console.log(`[Fulfill VoBiz Number] Number ${number} purchased and added for user ${tx.userId}.`);
  }
}

module.exports = new PaymentService();
