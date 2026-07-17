const { VobizNumber, Agent, User } = require('../src/models');
const sequelize = require('../src/config/database');

async function checkSetup() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    const numbers = await VobizNumber.findAll({
      include: [
        { model: Agent, as: 'agent' },
        { model: User, as: 'user', attributes: ['id', 'email', 'businessName'] }
      ]
    });

    console.log(`\nFound ${numbers.length} virtual numbers in the database:`);
    numbers.forEach((num, index) => {
      console.log(`\n[${index + 1}] Number: ${num.number}`);
      console.log(`    Status: ${num.status}`);
      console.log(`    User: ${num.user ? `${num.user.email} (${num.user.businessName})` : 'None'}`);
      console.log(`    Agent ID: ${num.agentId}`);
      console.log(`    Agent Name: ${num.agent ? num.agent.name : 'NONE'}`);
      console.log(`    Agent Approval Status: ${num.agent ? num.agent.approvalStatus : 'N/A'}`);
      console.log(`    Agent Active Status: ${num.agent ? num.agent.activeStatus : 'N/A'}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Error checking setup:', err);
    process.exit(1);
  }
}

checkSetup();
