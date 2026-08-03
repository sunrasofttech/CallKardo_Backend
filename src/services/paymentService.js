const axios = require('axios');
const crypto = require('crypto');
const defaults = require('../config/defaults');
const { PaymentTransaction, User, Plan, Subscription, VobizAccount, VobizNumber } = require('../models');
const vobizService = require('./vobizService');
const { removeTrialDemoNumber } = require('./trialDemoNumberService');
const { decrypt } = require('../utils/crypto');
const NotificationService = require('./notificationService');

class PaymentService {
  /**
   * Initiate payment with external gateway
   */
  async initiatePayment({ userId, type, targetId, amount, note, customerName, customerMobile, customerEmail }) {
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error('User not found');
    }

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
        gateway_type: gateway_type,
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

    // Send callback to ABC Gate for both success & failed payments
    let abcGateCallbackSuccess = false;
    try {
      const apiKey = defaults.paymentGateway.apiToken;
      const response = await axios.post(
        "https://api.abcgate.shop/api/callback/upiid",
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

    return {
      success: true,
      message: `Payment callback processed successfully (status: ${finalStatus})`,
      data: {
        orderId: order_id,
        status: finalStatus,
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
    console.log(`[Fulfill Subscription] Successfully upgraded user ${tx.userId} to ${plan.name} plan.`);

    // Notifications
    await NotificationService.notifyMerchant(tx.userId, 'Payment Completed', `Your payment for the ${plan.name} plan was successful.`, 'payments');
    await NotificationService.notifyAdmin('Plan Upgraded', `Merchant (User ID: ${tx.userId}) upgraded to the ${plan.name} plan.`, null, 'payments');
  }

  /**
   * Helper: Fulfill VoBiz phone number purchase after successful payment
   */
  async _fulfillVobizNumberPurchase(tx) {
    const number = tx.targetId;

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

    await VobizNumber.create({
      userId: tx.userId,
      number: number,
      status: 'active',
      rentalExpiryDate,
      providerData: purchaseResult,
    });

    console.log(`[Fulfill VoBiz Number] Number ${number} purchased and added for user ${tx.userId} with expiry ${rentalExpiryDate}.`);

    // Notifications
    await NotificationService.notifyMerchant(tx.userId, 'Payment Completed', `Your payment for VoBiz number ${number} was successful.`, 'payments');
    await NotificationService.notifyAdmin('Number Purchased', `Merchant (User ID: ${tx.userId}) purchased a new VoBiz number: ${number}.`, null, 'payments');
  }
}

module.exports = new PaymentService();
