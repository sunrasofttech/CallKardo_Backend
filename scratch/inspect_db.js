const models = require('../src/models');
const sequelize = require('../src/config/database');

async function inspect() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    for (const [name, Model] of Object.entries(models)) {
      if (name === 'sequelize') continue;
      try {
        const count = await Model.count();
        console.log(`Model: ${name.padEnd(20)} Count: ${count}`);
      } catch (err) {
        console.log(`Model: ${name.padEnd(20)} Count: ERROR (${err.message})`);
      }
    }

    // Also list user accounts
    const users = await models.User.findAll({ attributes: ['id', 'email', 'mobile', 'businessName'] });
    console.log('\nUsers:');
    users.forEach(u => {
      console.log(`- ${u.email || u.mobile} | business: ${u.businessName} | id: ${u.id}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error inspecting:', err);
    process.exit(1);
  }
}

inspect();
