require('dotenv').config();
const { User, Plan, Subscription, sequelize } = require('../src/models');
const adminController = require('../src/controllers/adminController');

async function testAdminSubscriptions() {
  console.log('--- Starting Admin Subscriptions Test ---');
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // 1. Ensure a test Plan exists
    let plan = await Plan.findOne();
    if (!plan) {
      plan = await Plan.create({
        name: 'Pro Tier Test',
        price: 99.99,
        callLimit: 500,
        maxConcurrentCalls: 5,
      });
      console.log('Created test plan:', plan.name);
    } else {
      console.log('Using existing plan:', plan.name, plan.id);
    }

    // 2. Ensure a test Merchant User exists
    let merchant = await User.findOne({ where: { role: 'merchant' } });
    if (!merchant) {
      merchant = await User.create({
        email: `testmerchant_${Date.now()}@example.com`,
        passwordHash: 'hashedpass',
        role: 'merchant',
        businessName: 'Test Business Admin Sub',
        isVerified: true,
      });
      console.log('Created test merchant:', merchant.email);
    } else {
      console.log('Using existing merchant:', merchant.email, merchant.id);
    }

    // Mock Express res & req
    const createMockRes = () => {
      const res = {};
      res.statusCode = 200;
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (data) => {
        res.data = data;
        return res;
      };
      return res;
    };

    // Test 1: Upgrade Merchant Subscription via Admin
    console.log('\nTesting upgradeMerchantSubscription...');
    const reqUpgrade = {
      params: {},
      body: {
        merchantId: merchant.id,
        planId: plan.id,
        customCallLimit: 1000,
        durationMonths: 2,
      },
    };
    const resUpgrade = createMockRes();
    await adminController.upgradeMerchantSubscription(reqUpgrade, resUpgrade, (err) => {
      if (err) throw err;
    });

    console.log('Upgrade Result Status:', resUpgrade.statusCode);
    console.log('Upgrade Result Success:', resUpgrade.data.success);
    console.log('Upgraded Active Plan:', resUpgrade.data.data.activePlan);
    console.log('Calls Remaining:', resUpgrade.data.data.callsRemaining);
    console.log('Expiry Date:', resUpgrade.data.data.expiryDate);

    if (resUpgrade.statusCode !== 200 || !resUpgrade.data.success) {
      throw new Error('Upgrade subscription failed');
    }

    // Test 2: Get Subscriptions (Listing)
    console.log('\nTesting getSubscriptions (Admin list)...');
    const reqList = {
      query: { page: 1, limit: 10 },
    };
    const resList = createMockRes();
    await adminController.getSubscriptions(reqList, resList, (err) => {
      if (err) throw err;
    });

    console.log('List Result Status:', resList.statusCode);
    console.log('Total Subscriptions:', resList.data.data.pagination.total);
    console.log('Subscriptions Count:', resList.data.data.subscriptions.length);

    if (resList.statusCode !== 200 || !resList.data.success) {
      throw new Error('Get subscriptions failed');
    }

    // Test 3: Get Subscription by ID
    const subId = resUpgrade.data.data.id;
    console.log('\nTesting getSubscriptionById for ID:', subId);
    const reqGet = { params: { id: subId } };
    const resGet = createMockRes();
    await adminController.getSubscriptionById(reqGet, resGet, (err) => {
      if (err) throw err;
    });

    console.log('Get By ID Result Status:', resGet.statusCode);
    console.log('Found Subscription Plan:', resGet.data.data.activePlan);

    // Test 4: Update Subscription (Admin Override)
    console.log('\nTesting updateSubscription (Admin override)...');
    const reqUpdate = {
      params: { id: subId },
      body: {
        callsRemaining: 2500,
        status: 'active',
      },
    };
    const resUpdate = createMockRes();
    await adminController.updateSubscription(reqUpdate, resUpdate, (err) => {
      if (err) throw err;
    });

    console.log('Update Result Status:', resUpdate.statusCode);
    console.log('Updated Calls Remaining:', resUpdate.data.data.callsRemaining);

    // Test 5: Cancel Subscription
    console.log('\nTesting cancelSubscription...');
    const reqCancel = { params: { id: subId } };
    const resCancel = createMockRes();
    await adminController.cancelSubscription(reqCancel, resCancel, (err) => {
      if (err) throw err;
    });

    console.log('Cancel Result Status:', resCancel.statusCode);
    console.log('Cancelled Status:', resCancel.data.data.status);

    console.log('\n--- ALL ADMIN SUBSCRIPTION TESTS PASSED SUCCESSFULLY ---');
  } catch (error) {
    console.error('Error during test:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

testAdminSubscriptions();
