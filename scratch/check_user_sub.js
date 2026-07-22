require('dotenv').config();
const { Subscription, Plan, User, sequelize } = require('../src/models');
const SubscriptionService = require('../src/services/subscriptionService');

async function testSub() {
  try {
    await sequelize.authenticate();
    const userId = '998e3036-1683-44f8-adc4-d2aea8b0e271';
    console.log(`Checking subscription & validation for user: ${userId}`);

    const sub = await Subscription.findOne({
      where: { userId },
      include: [{ model: Plan, as: 'plan' }],
    });

    console.log('Subscription Record in DB:', sub ? sub.toJSON() : 'NULL');

    const user = await User.findByPk(userId);
    console.log('User Record in DB        :', user ? { id: user.id, email: user.email, kycStatus: user.kycStatus } : 'NULL');

    const result = await SubscriptionService.validateCallLimits(userId);
    console.log('\nvalidateCallLimits Result:', result);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

testSub();
