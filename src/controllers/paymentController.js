const paymentService = require('../services/paymentService');
const vobizService = require('../services/vobizService');
const { Plan, PaymentTransaction, VobizNumber } = require('../models');
const ResponseBuilder = require('../utils/response');

class PaymentController {
  /**
   * General payment initiate endpoint (matches POST /api/payments/initiate specification)
   */
  async initiatePayment(req, res, next) {
    try {
      const { amount, orderId, customer_name, customer_mobile, customer_email, note, type, targetId } = req.body;

      if (!amount) {
        return ResponseBuilder.error(res, 'Amount is required', 400);
      }

      const result = await paymentService.initiatePayment({
        userId: req.user.id,
        type: type || 'SUBSCRIPTION',
        targetId: targetId || 'GENERAL',
        amount,
        note,
        customerName: customer_name,
        customerMobile: customer_mobile,
        customerEmail: customer_email,
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error('[PaymentController] Initiate error:', err.message);
      return res.status(400).json({
        success: false,
        message: 'Something went wrong',
        data: {
          success: false,
          error: {
            message: err.message || 'Payment initiation failed',
            code: 'INITIATION_ERROR',
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  }

  /**
   * Initiate payment specifically for buying a subscription plan
   */
  async initiateSubscriptionPayment(req, res, next) {
    try {
      const { planId, customer_name, customer_mobile, customer_email } = req.body;

      if (!planId) {
        return ResponseBuilder.error(res, 'Plan ID (planId) is required', 400);
      }

      const plan = await Plan.findByPk(planId);
      if (!plan) {
        return ResponseBuilder.error(res, 'Subscription plan not found', 404);
      }

      const result = await paymentService.initiatePayment({
        userId: req.user.id,
        type: 'SUBSCRIPTION',
        targetId: plan.id,
        amount: plan.price || 100,
        note: `Subscription Purchase: ${plan.name} Plan`,
        customerName: customer_name,
        customerMobile: customer_mobile,
        customerEmail: customer_email,
      });

      return ResponseBuilder.success(res, result.data, 'Subscription payment initiated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Initiate payment specifically for buying a VoBiz phone number
   */
  async initiateNumberPurchasePayment(req, res, next) {
    try {
      const { number, customer_name, customer_mobile, customer_email } = req.body;

      if (!number) {
        return ResponseBuilder.error(res, 'Phone number (number) is required', 400);
      }

      const e164 = number.startsWith('+') ? number : `+${number}`;
      
      // Fetch standard pricing for this region (since API doesn't filter exact numbers)
      const numberData = await vobizService.listAvailableNumbers('IN', 'local', '', 1, 1);
      const standardPricing = numberData.items && numberData.items[0];
      
      if (!standardPricing) {
        return ResponseBuilder.error(res, 'Could not fetch pricing from VoBiz inventory', 404);
      }

      const setupFee = standardPricing.setup_fee || 0;
      const monthlyFee = standardPricing.monthly_fee || 0;
      const totalAmount = setupFee + monthlyFee;

      const result = await paymentService.initiatePayment({
        userId: req.user.id,
        type: 'VOBIZ_NUMBER',
        targetId: `${e164}|${setupFee}|${monthlyFee}`, // Pass fees via targetId
        amount: totalAmount,
        note: `VoBiz Number Purchase: ${e164} (Setup: ${setupFee}, Monthly: ${monthlyFee})`,
        customerName: customer_name,
        customerMobile: customer_mobile,
        customerEmail: customer_email,
      });

      return ResponseBuilder.success(res, result.data, 'VoBiz number purchase payment initiated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Initiate payment specifically for renewing a VoBiz phone number
   */
  async initiateNumberRenewalPayment(req, res, next) {
    try {
      const { number, customer_name, customer_mobile, customer_email } = req.body;

      if (!number) {
        return ResponseBuilder.error(res, 'Phone number (number) is required', 400);
      }

      const e164 = number.startsWith('+') ? number : `+${number}`;
      
      const existingNumber = await VobizNumber.findOne({ where: { userId: req.user.id, number: e164 } });
      
      if (!existingNumber) {
        return ResponseBuilder.error(res, 'Phone number not found in your account', 404);
      }

      const providerData = existingNumber.providerData || {};
      const monthlyFee = providerData.monthlyFee || 500; // Fallback to 500 if unknown

      const result = await paymentService.initiatePayment({
        userId: req.user.id,
        type: 'VOBIZ_NUMBER',
        targetId: e164, // Just the number since it's a renewal
        amount: monthlyFee,
        note: `VoBiz Number Renewal: ${e164} (Monthly: ${monthlyFee})`,
        customerName: customer_name,
        customerMobile: customer_mobile,
        customerEmail: customer_email,
      });

      return ResponseBuilder.success(res, result.data, 'VoBiz number renewal payment initiated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Handle incoming Webhook events from Payment Gateway
   * Listening for POST requests (PAYIN & PAYOUT)
   */
  async handleWebhook(req, res, next) {
    try {
      console.log('[PaymentController] Incoming webhook request:', {
        headers: req.headers,
        body: req.body,
      });

      const result = await paymentService.processWebhook(req.body);

      return res.status(200).json(result);
    } catch (err) {
      console.error('[PaymentController] Webhook handling error:', err.message);
      return res.status(200).json({
        success: false,
        message: err.message || 'Webhook processing failed',
      });
    }
  }

  /**
   * Complete payment callback called directly from App itself
   * Updates local payment transaction and triggers ABC Gate callback
   */
  async completePaymentAppCallback(req, res, next) {
    try {
      console.log('[PaymentController] App completion webhook request:', {
        body: req.body,
      });

      const { order_id, status, amount, urn_number } = req.body;

      const result = await paymentService.completePaymentAppCallback({
        order_id,
        status,
        amount,
        urn_number,
      });

      return res.status(200).json(result);
    } catch (err) {
      console.error('[PaymentController] App callback completion error:', err.message);
      return res.status(400).json({
        success: false,
        message: err.message || 'Payment completion failed',
      });
    }
  }

  /**
   * Check status of a payment transaction by orderId
   */
  async getTransactionStatus(req, res, next) {
    try {
      const { orderId } = req.params;

      const tx = await PaymentTransaction.findOne({
        where: { orderId, userId: req.user.id },
      });

      if (!tx) {
        return ResponseBuilder.error(res, 'Payment transaction not found', 404);
      }

      return ResponseBuilder.success(res, {
        orderId: tx.orderId,
        status: tx.status,
        type: tx.type,
        targetId: tx.targetId,
        amount: tx.amount,
        paymentUrl: tx.paymentUrl,
        upiString: tx.upiString,
        createdAt: tx.createdAt,
        updatedAt: tx.updatedAt,
      }, 'Payment status retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all transactions for the current merchant
   */
  async getMyTransactions(req, res, next) {
    try {
      const transactions = await PaymentTransaction.findAll({
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC']],
      });

      return ResponseBuilder.success(res, transactions, 'Payment transactions retrieved');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new PaymentController();
