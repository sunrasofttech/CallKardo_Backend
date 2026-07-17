const { User, Agent, VobizNumber, Voice, Category } = require('../src/models');
const sequelize = require('../src/config/database');
const defaults = require('../src/config/defaults');

async function restore() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected.');

    // 1. Find user test-merchant@example.com
    const user = await User.findOne({ where: { email: 'test-merchant@example.com' } });
    if (!user) {
      console.error('❌ User test-merchant@example.com not found in database.');
      process.exit(1);
    }
    console.log(`Found user: ${user.email} (ID: ${user.id})`);

    // 2. Find or create an agent for this user
    let agent = await Agent.findOne({ where: { userId: user.id } });
    if (!agent) {
      console.log('Creating a default support agent for test-merchant...');
      const voice = await Voice.findOne({ where: { provider: 'sarvam' } }) || await Voice.findOne();
      const category = await Category.findOne() || { id: null };
      
      agent = await Agent.create({
        userId: user.id,
        name: 'Acme Inbound Agent',
        description: 'Default Inbound agent for test-merchant',
        systemPrompt: 'You are a helpful customer service assistant for Acme Sales Team. Keep responses short and sweet.',
        firstMessage: 'Hello! Welcome to Acme Sales Team support. How can I help you today?',
        language: 'en-IN',
        voiceId: voice ? voice.id : null,
        categoryId: category ? category.id : null,
        isCustom: true,
        approvalStatus: 'approved',
        activeStatus: true
      });
      console.log(`✅ Created agent: ${agent.name} (ID: ${agent.id})`);
    } else {
      console.log(`Found existing agent: ${agent.name} (ID: ${agent.id})`);
    }

    // 3. Find or create the demo VobizNumber record
    const targetNumber = defaults.vobiz.demoNumber;
    let vobizNumber = await VobizNumber.findOne({
      where: { number: targetNumber },
      paranoid: false
    });

    if (vobizNumber) {
      console.log(`Found existing number record for ${targetNumber} (Deleted: ${vobizNumber.deletedAt !== null})`);
      // Restore if soft-deleted, and update agent assignment
      await vobizNumber.restore();
      await vobizNumber.update({
        userId: user.id,
        agentId: agent.id,
        status: 'active'
      });
      console.log('✅ Restored and updated virtual number.');
    } else {
      console.log(`Creating new virtual number record for ${targetNumber}...`);
      vobizNumber = await VobizNumber.create({
        userId: user.id,
        number: targetNumber,
        status: 'active',
        agentId: agent.id,
        providerData: { isDemo: true }
      });
      console.log('✅ Created new virtual number.');
    }

    console.log('\nSetup verify:');
    const verifyNum = await VobizNumber.findOne({
      where: { number: targetNumber },
      include: [{ model: Agent, as: 'agent' }]
    });
    console.log(`Number: ${verifyNum.number}`);
    console.log(`Status: ${verifyNum.status}`);
    console.log(`Agent: ${verifyNum.agent ? verifyNum.agent.name : 'NONE'}`);
    console.log(`User ID: ${verifyNum.userId}`);

    console.log('\n🚀 Inbound calls to ' + targetNumber + ' should now work!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error restoring demo number:', err);
    process.exit(1);
  }
}

restore();
