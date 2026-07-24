/**
 * Unit & Integration Test for Payment Gateway & Webhook Fulfillment
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { sequelize, User, Plan, Subscription, VobizNumber, PaymentTransaction } = require('../src/models');
const paymentService = require('../src/services/paymentService');

let passed = 0;
let failed = 0;

function assert(condition, label, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== PAYMENT GATEWAY & WEBHOOK FULFILLMENT TEST ===\n');

  try {
    await sequelize.authenticate();
    console.log('✅ DB connected\n');

    // Sync PaymentTransaction table
    await PaymentTransaction.sync({ alter: true });
    console.log('✅ PaymentTransaction table synced\n');

    // Get a test merchant user
    const merchant = await User.findOne({ where: { role: 'merchant' } });
    assert(!!merchant, 'Found merchant user in DB', `userId=${merchant?.id}`);

    if (!merchant) return;

    // Get a test plan
    let plan = await Plan.findOne();
    if (!plan) {
      plan = await Plan.create({
        name: 'Pro Starter',
        callLimit: 500,
        price: 1999,
        maxConcurrentCalls: 5,
      });
    }
    assert(!!plan, 'Found or created Plan in DB', `planId=${plan?.id}`);

    // --- TEST 1: Initiate Payment Record Creation ---
    console.log('\n--- TEST 1: PaymentTransaction initiation ---');
    const orderId = `SUB_TEST_${Date.now()}`;
    const tx = await PaymentTransaction.create({
      userId: merchant.id,
      orderId,
      type: 'SUBSCRIPTION',
      targetId: plan.id,
      amount: '1999',
      status: 'pending',
      customerName: merchant.businessName || 'Test Merchant',
      customerMobile: merchant.mobile || '9876543210',
      customerEmail: merchant.email || 'test@merchant.com',
      note: 'Subscription test purchase',
    });
    assert(!!tx, 'PaymentTransaction created with pending status', `txId=${tx.id}`);
    assert(tx.status === 'pending', 'Status is pending');

    // --- TEST 2: Process PAYIN Webhook (Subscription Purchase) ---
    console.log('\n--- TEST 2: Process PAYIN Webhook for Subscription ---');
    const webhookPayload = {
      event_type: 'PAYIN',
      data: {
        order_id: orderId,
        status: 'success',
        amount: '1999',
        urn_number: 'URN9876543210',
      },
    };

    const webhookResult = await paymentService.processWebhook(webhookPayload);
    assert(webhookResult.success === true, 'Webhook returned success: true');

    const updatedTx = await PaymentTransaction.findOne({ where: { orderId } });
    assert(updatedTx.status === 'success', 'Transaction status updated to success');
    assert(updatedTx.urnNumber === 'URN9876543210', 'URN number saved correctly');

    const sub = await Subscription.findOne({ where: { userId: merchant.id } });
    assert(!!sub, 'Subscription record updated/created');
    assert(sub?.planId === plan.id, 'Subscription planId matched target plan');
    assert(sub?.status === 'active', 'Subscription status is active');

    // --- TEST 3: Process PAYIN Webhook for VoBiz Number Purchase ---
    console.log('\n--- TEST 3: Process PAYIN Webhook for VoBiz Number ---');
    const testPhone = `+9198${Date.now().toString().slice(-8)}`;
    const numberOrderId = `NUM_TEST_${Date.now()}`;

    const numTx = await PaymentTransaction.create({
      userId: merchant.id,
      orderId: numberOrderId,
      type: 'VOBIZ_NUMBER',
      targetId: testPhone,
      amount: '500',
      status: 'pending',
      customerName: 'Test Merchant',
      customerMobile: '9876543210',
      customerEmail: 'test@merchant.com',
      note: 'VoBiz Number purchase',
    });

    const numWebhookPayload = {
      event_type: 'PAYIN',
      data: {
        order_id: numberOrderId,
        status: 'success',
        amount: '500',
        urn_number: 'URN_NUM_123456',
      },
    };

    const numWebhookResult = await paymentService.processWebhook(numWebhookPayload);
    assert(numWebhookResult.success === true, 'VoBiz number webhook returned success: true');

    const updatedNumTx = await PaymentTransaction.findOne({ where: { orderId: numberOrderId } });
    assert(updatedNumTx.status === 'success', 'VoBiz number transaction marked success');

    const vobizNum = await VobizNumber.findOne({ where: { userId: merchant.id, number: testPhone } });
    assert(!!vobizNum, 'VoBiz phone number record created in DB for merchant');
    assert(vobizNum?.status === 'active', 'VoBiz phone number status is active');

    // --- TEST 4: Duplicate/Idempotent Webhook Processing ---
    console.log('\n--- TEST 4: Duplicate Webhook Idempotency ---');
    const dupResult = await paymentService.processWebhook(webhookPayload);
    assert(dupResult.success === true, 'Duplicate webhook returns success');
    assert(dupResult.message.includes('already completed'), 'Handled idempotently without error');

    // Clean up test data
    await updatedNumTx?.destroy();
    await updatedTx?.destroy();
    await vobizNum?.destroy();

    console.log(`\n${'='.repeat(40)}`);
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    if (failed === 0) {
      console.log('✅ ALL PAYMENT GATEWAY TESTS PASSED SUCCESSFULLY');
    } else {
      console.log(`❌ ${failed} TEST(S) FAILED`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Test script crashed:', err);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

runTests();
