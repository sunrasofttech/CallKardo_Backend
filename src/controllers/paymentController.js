const paymentService = require('../services/paymentService');
const { Plan, PaymentTransaction } = require('../models');
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
      const { number, amount, customer_name, customer_mobile, customer_email } = req.body;

      if (!number) {
        return ResponseBuilder.error(res, 'Phone number (number) is required', 400);
      }

      const numAmount = amount || 500; // Default price if not specified

      const result = await paymentService.initiatePayment({
        userId: req.user.id,
        type: 'VOBIZ_NUMBER',
        targetId: number,
        amount: numAmount,
        note: `VoBiz Number Purchase: ${number}`,
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
