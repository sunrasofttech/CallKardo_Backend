require('dotenv').config();
const { Campaign, CampaignCustomer, CustomerList, VobizNumber, Agent, sequelize } = require('../src/models');
const QueueService = require('../src/services/queueService');
const SubscriptionService = require('../src/services/subscriptionService');
const { redisClient } = require('../src/config/redis');

async function testCampaignRun() {
  try {
    await sequelize.authenticate();
    console.log('=== START CAMPAIGN TEST & STEP-BY-STEP TRACE ===');

    const userId = '998e3036-1683-44f8-adc4-d2aea8b0e271';

    // 1. Get or create active VoBiz Number for this user
    let number = await VobizNumber.findOne({ where: { status: 'active' } });
    if (!number) {
      console.log('No active VoBiz number found. Creating a test active number record...');
      number = await VobizNumber.create({
        userId,
        number: '+918071583805',
        status: 'active',
      });
    }

    // 2. Get customer list
    const list = await CustomerList.findOne({ where: { userId } });
    if (!list) {
      console.error('No customer list found for user');
      return;
    }

    // 3. Get agent
    const agent = await Agent.findOne({ where: { activeStatus: true } });

    // 4. Create a fresh Test Campaign
    console.log(`\nCreating Test Campaign for User ${userId}...`);
    const campaign = await Campaign.create({
      userId,
      name: `Test Run ${Date.now()}`,
      vobizNumberId: number.id,
      agentId: agent ? agent.id : '61a94bd9-32e9-471d-b33a-f14e43f98913',
      customerListId: list.id,
      startTime: new Date(),
      intervalBetweenCalls: 5,
      maxConcurrentCalls: 2,
      status: 'draft',
    });

    console.log(`Created Campaign ID: ${campaign.id} | Status: ${campaign.status}`);

    // Populate Campaign Customers
    const { CustomerListMember } = require('../src/models');
    const members = await CustomerListMember.findAll({ where: { customerListId: list.id } });
    console.log(`Found ${members.length} members in list ${list.id}`);

    const campaignCustomers = members.map((m) => ({
      campaignId: campaign.id,
      customerId: m.customerId,
      callStatus: 'pending',
    }));
    await CampaignCustomer.bulkCreate(campaignCustomers);

    // Update campaign status to running
    campaign.status = 'running';
    await campaign.save();
    console.log(`Updated Campaign ${campaign.id} status to 'running'`);

    // 5. Test Scheduler Dispatch
    console.log('\n--- SIMULATING SCHEDULER DISPATCH ---');
    const activeCalls = await QueueService.getActiveCalls(campaign.id);
    console.log(`Active calls count: ${activeCalls}`);

    const limitCheck = await SubscriptionService.validateCallLimits(userId);
    console.log('Subscription validateCallLimits:', limitCheck);

    if (!limitCheck.isValid) {
      console.error('FAIL: Subscription limit check returned isValid: false!');
      return;
    }

    const pending = await CampaignCustomer.findAll({
      where: { campaignId: campaign.id, callStatus: 'pending' },
    });

    console.log(`Found ${pending.length} pending customers for dispatch.`);

    for (const p of pending) {
      console.log(`Enqueuing PLACE_CALL for customer ${p.customerId}...`);
      await QueueService.enqueueJob('PLACE_CALL', {
        campaignId: campaign.id,
        customerId: p.customerId,
        userId: campaign.userId,
      });
    }

    // 6. Inspect Queue
    const qLen = await redisClient.lLen('queue:call_queue');
    console.log(`\nRedis queue:call_queue length after dispatch: ${qLen}`);

    console.log('\nCampaign dispatches successfully enqueued into call_queue!');

  } catch (err) {
    console.error('Error during campaign test:', err);
  } finally {
    await sequelize.close();
  }
}

testCampaignRun();
