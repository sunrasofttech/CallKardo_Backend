const { Agent, User } = require('../src/models');
const sequelize = require('../src/config/database');

async function inspectAgents() {
  try {
    await sequelize.authenticate();
    const agents = await Agent.findAll({
      include: [{ model: User, as: 'user', attributes: ['email', 'businessName'] }]
    });

    console.log(`Found ${agents.length} agents in the database:`);
    agents.forEach((agent, index) => {
      console.log(`\n[${index + 1}] Agent ID: ${agent.id}`);
      console.log(`    Name: ${agent.name}`);
      console.log(`    Merchant: ${agent.user ? agent.user.email : 'None'}`);
      console.log(`    AI Provider: ${agent.aiProvider}`);
      console.log(`    Approval Status: ${agent.approvalStatus}`);
      console.log(`    Active Status: ${agent.activeStatus}`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Error inspecting:', err);
    process.exit(1);
  }
}

inspectAgents();
