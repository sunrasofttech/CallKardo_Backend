const { PaymentTransaction, User } = require('../src/models');
const paymentService = require('../src/services/paymentService');
const assert = require('assert');

async function runTest() {
  console.log('=== APP CALLBACK & ABC GATEWAY NOTIFICATION TEST ===\n');

  const merchant = await User.findOne({ where: { role: 'merchant' } });
  assert(!!merchant, 'Merchant found');

  const testOrderId = `SUB${Date.now().toString().slice(-6)}${Math.random().toString(36).slice(2, 6)}`;

  const tx = await PaymentTransaction.create({
    userId: merchant.id,
    orderId: testOrderId,
    type: 'SUBSCRIPTION',
    targetId: '1fb31230-104b-4105-9252-397eb99ff33a',
    amount: '100',
    status: 'pending',
    customerName: merchant.businessName || 'Test Merchant',
    customerMobile: '9876543210',
    customerEmail: 'test@merchant.com',
    note: 'App Callback test',
  });

  console.log(`Created test pending transaction order_id: ${testOrderId}`);

  const res = await paymentService.completePaymentAppCallback({
    order_id: testOrderId,
    status: 'success',
    amount: '100',
    urn_number: '9876543210',
  });

  console.log('completePaymentAppCallback result:', res);
  assert(res.success === true, 'Response success is true');

  const updatedTx = await PaymentTransaction.findOne({ where: { orderId: testOrderId } });
  assert(updatedTx.status === 'success', 'Transaction status updated to success');
  assert(updatedTx.urnNumber === '9876543210', 'URN number saved');

  console.log('\n✅ TEST PASSED CLEANLY!');
  process.exit(0);
}

runTest().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
