const { sequelize, User, CallSession, CallReport, Subscription, Plan } = require('../src/models');

async function check() {
  try {
    await sequelize.authenticate();
    console.log('Database connection OK.');

    const merchantCount = await User.count({ where: { role: 'merchant' } });
    console.log('Merchant count:', merchantCount);

    const callSessionsCount = await CallSession.count();
    console.log('Call Sessions count:', callSessionsCount);

    const callReportsCount = await CallReport.count();
    console.log('Call Reports count:', callReportsCount);

    const subscriptionsCount = await Subscription.count();
    console.log('Subscriptions count:', subscriptionsCount);

    const plansCount = await Plan.count();
    console.log('Plans count:', plansCount);

    // Get an existing merchant if any
    const firstMerchant = await User.findOne({ where: { role: 'merchant' } });
    if (firstMerchant) {
      console.log('First Merchant ID:', firstMerchant.id, 'Email:', firstMerchant.email);
    } else {
      console.log('No merchants found.');
    }

    // Get an existing admin if any
    const firstAdmin = await User.findOne({ where: { role: 'admin' } });
    if (firstAdmin) {
      console.log('First Admin (User model) ID:', firstAdmin.id, 'Email:', firstAdmin.email);
    } else {
      console.log('No admins in User model. Checking Admin model...');
      const { Admin } = require('../src/models');
      const firstAdminModel = await Admin.findOne();
      if (firstAdminModel) {
        console.log('First Admin (Admin model) ID:', firstAdminModel.id, 'Email:', firstAdminModel.email);
      } else {
        console.log('No admins found at all.');
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during check:', error);
    process.exit(1);
  }
}

check();
