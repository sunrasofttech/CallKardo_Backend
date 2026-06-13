/**
 * AI Calling SaaS Integration Pipeline Test
 * 
 * This script runs the entire backend pipeline end-to-end:
 * 1. Syncs Database and Seeds default Categories, Voices, and Plans.
 * 2. Simulates merchant registration & auto-attachment of free Starter plan.
 * 3. Configures merchant's VoBiz account & registers an outbound calling number.
 * 4. Creates an AI voice agent.
 * 5. Adds a customer and assigns them to a customer list.
 * 6. Creates and starts a scheduled Campaign.
 * 7. Starts Scheduler, Call, and AI Worker ticks concurrently.
 * 8. Triggers the Call Worker to process the call, which makes an outbound call
 *    and spawns our local VoBiz WS client simulator.
 * 9. The WS connection establishes (STT -> Gemini Live -> TTS), streams silent static,
 *    and finishes.
 * 10. The AI worker picks up completion, analyzes transcript, writes reports, and concludes campaign.
 */

const http = require('http');
const app = require('./src/app');
const { startWebSocketServer } = require('./src/websocket/wsServer');
const {
  sequelize,
  Category,
  Voice,
  Plan,
  User,
  Subscription,
  VobizAccount,
  VobizNumber,
  Agent,
  Customer,
  CustomerList,
  CustomerListMember,
  Campaign,
  CampaignCustomer,
  CallSession,
  CallReport,
} = require('./src/models');

const QueueService = require('./src/services/queueService');
const { startScheduler } = require('./src/workers/schedulerWorker');
const { startCallWorker } = require('./src/workers/callWorker');
const { startAiWorker } = require('./src/workers/aiWorker');

const { seedVoices } = require('./src/utils/seeder');

const PORT = 3001; // Separate port for testing

async function runIntegrationTest() {
  console.log('--- STARTING AI CALLING SAAS INTEGRATION TEST ---');
  
  try {
    // 1. Force Sync database tables
    console.log('Force-syncing database tables...');
    await sequelize.sync({ force: true });
    console.log('Database synced.');

    // 2. Seed Baseline Data
    console.log('Seeding voices, plans, and categories...');
    await seedVoices();

    const defaultVoice = await Voice.findOne({ where: { voiceId: 'shubh' } });

    const lawyerCategory = await Category.create({
      name: 'Lawyer',
      defaultPrompt: 'You are a professional lawyer assistant. Qualify client leads.',
      defaultVoiceId: defaultVoice.id,
      defaultLanguage: 'en',
    });

    const starterPlan = await Plan.create({
      name: 'Starter',
      price: 0.00,
      callLimit: 5,
      maxConcurrentCalls: 1,
    });
    console.log('Baseline data seeded.');

    // 3. Register Merchant
    console.log('Registering merchant...');
    const user = await User.create({
      email: 'merchant@example.com',
      passwordHash: 'hashed_password_123',
      businessName: 'Apex Legal Partners',
      categoryId: lawyerCategory.id,
      isVerified: true,
    });

    await Subscription.create({
      userId: user.id,
      planId: starterPlan.id,
      activePlan: starterPlan.name,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      callsUsed: 0,
      callsRemaining: 5,
      status: 'active',
    });
    console.log('Merchant registered with Starter Plan.');

    // 4. Configure VoBiz Credentials & Number
    console.log('Configuring VoBiz integrations...');
    await VobizAccount.create({
      userId: user.id,
      customerId: 'vobiz-cust-9988',
      apiKey: 'vobiz_key_prod_abc123xyz',
      apiSecret: 'vobiz_secret_prod_secret456',
    });

    const vobizNum = await VobizNumber.create({
      userId: user.id,
      number: '+15550199',
      status: 'active',
    });
    console.log('VoBiz number registered.');

    // 5. Create AI Agent
    console.log('Creating Voice Agent...');
    const agent = await Agent.create({
      userId: user.id,
      name: 'Legal Intake Assistant',
      description: 'Qualify lawyer consultations',
      systemPrompt: 'Greet the user. Ask if they need consultation for Civil or Criminal matters. Confirm details.',
      language: 'en',
      voiceId: defaultVoice.id,
      categoryId: lawyerCategory.id,
    });
    console.log('AI voice agent created.');

    // 6. Create Customer & Customer List
    console.log('Creating Customer directory...');
    const customer = await Customer.create({
      userId: user.id,
      name: 'John Doe',
      mobile: '+15550100',
      tags: 'lead, consultation',
      notes: 'Needs help with property contract dispute.',
    });

    const customerList = await CustomerList.create({
      userId: user.id,
      name: 'Contract Dispute Leads',
      description: 'CSV bulk uploaded list',
    });

    await CustomerListMember.create({
      customerListId: customerList.id,
      customerId: customer.id,
    });
    console.log('Customer lists mapped.');

    // 7. Boot HTTP Server and WebSockets for outbound dial receiver
    console.log('Bootstrapping server and websockets...');
    const server = http.createServer(app);
    startWebSocketServer(server);
    server.listen(PORT);
    console.log(`Server listening on port ${PORT}`);

    // Set WS host config for testing
    process.env.WS_PORT = PORT;

    // 8. Create Campaign
    console.log('Creating Outbound calling campaign...');
    const campaign = await Campaign.create({
      userId: user.id,
      name: 'Lawyer Consultation Campaign',
      vobizNumberId: vobizNum.id,
      agentId: agent.id,
      customerListId: customerList.id,
      startTime: new Date(Date.now() - 5000), // Started 5 seconds ago (Immediate)
      intervalBetweenCalls: 5,
      maxConcurrentCalls: 1,
      status: 'draft',
    });

    // 9. Start Workers in the background
    console.log('Spinning up background workers...');
    // We launch these worker loops as unawaited async calls
    startScheduler();
    startCallWorker();
    startAiWorker();

    // 10. Trigger Campaign Start sequence
    console.log('Starting Campaign...');
    // We simulate starting the campaign via its service logic
    // This transitions status, fills CampaignCustomers, and queues calls in Redis ZSET
    const startResult = await triggerCampaignStart(campaign.id, user.id);
    console.log(`Campaign started: ${startResult.name}, status is: ${startResult.status}`);

    // Wait and check database status periodically
    console.log('Waiting for call queue consumption, WS connection simulator, and AI reports...');
    let pollAttempts = 0;
    const interval = setInterval(async () => {
      pollAttempts++;
      
      const refreshedCampaign = await Campaign.findByPk(campaign.id);
      const reports = await CallReport.findAll({ where: { campaignId: campaign.id } });
      const sessions = await CallSession.findAll({ where: { campaignId: campaign.id } });
      const mappings = await CampaignCustomer.findAll({ where: { campaignId: campaign.id } });

      console.log(`[Tick ${pollAttempts}] Status: Campaign=${refreshedCampaign.status}, CallSessions=${sessions.length}, CallReports=${reports.length}`);

      if (sessions.length > 0) {
        console.log(` > Current Session status: ${sessions[0].status}`);
      }

      if (reports.length > 0) {
        clearInterval(interval);
        console.log('====================================================');
        console.log(' INTEGRATION PIPELINE SUCCESSFUL! CALL REPORT METRICS:');
        console.log(` - Summary: ${reports[0].summary}`);
        console.log(` - Outcome: ${reports[0].outcome}`);
        console.log(` - Sentiment: ${reports[0].sentiment}`);
        console.log(` - Lead Score: ${reports[0].leadScore}`);
        console.log(` - Call Duration: ${reports[0].duration} seconds`);
        console.log('====================================================');
        
        // Clean up connections and server
        server.close();
        console.log('Verification finished. Exit.');
        process.exit(0);
      }

      if (pollAttempts >= 15) {
        clearInterval(interval);
        console.error('Integration test timed out. Call session did not complete.');
        server.close();
        process.exit(1);
      }
    }, 2000);

  } catch (error) {
    console.error('Integration Test Failed:', error);
    process.exit(1);
  }
}

/**
 * Controller helper simulation to transition Campaign state and trigger scheduling
 */
async function triggerCampaignStart(campaignId, userId) {
  const transaction = await sequelize.transaction();
  const campaign = await Campaign.findByPk(campaignId, { transaction });
  
  campaign.status = 'running';
  await campaign.save({ transaction });

  const members = await CustomerListMember.findAll({
    where: { customerListId: campaign.customerListId },
    transaction,
  });

  const campaignCustomers = members.map((m) => ({
    campaignId: campaign.id,
    customerId: m.customerId,
    callStatus: 'pending',
  }));

  await CampaignCustomer.bulkCreate(campaignCustomers, { ignoreDuplicates: true, transaction });
  await transaction.commit();

  // Schedule PLACE_CALL job immediately in Redis Sorted Set
  await QueueService.scheduleJob(
    'PLACE_CALL',
    {
      campaignId: campaign.id,
      customerId: members[0].customerId,
      userId,
    },
    Date.now()
  );

  return campaign;
}

runIntegrationTest();
