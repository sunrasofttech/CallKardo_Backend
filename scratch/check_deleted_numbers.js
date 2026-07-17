const { VobizNumber, User } = require('../src/models');
const sequelize = require('../src/config/database');

async function checkDeleted() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    const numbers = await VobizNumber.findAll({
      paranoid: false,
      include: [{ model: User, as: 'user', attributes: ['email'] }]
    });

    console.log(`Found ${numbers.length} total numbers (including soft-deleted):`);
    numbers.forEach((num, index) => {
      console.log(`\n[${index + 1}] Number: ${num.number}`);
      console.log(`    Status: ${num.status}`);
      console.log(`    Merchant: ${num.user ? num.user.email : 'None'}`);
      console.log(`    Deleted At: ${num.deletedAt}`);
      console.log(`    Agent ID: ${num.agentId}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error checking:', err);
    process.exit(1);
  }
}

checkDeleted();
