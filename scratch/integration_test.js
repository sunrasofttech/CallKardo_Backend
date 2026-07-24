/**
 * Full end-to-end integration test for call campaign workflow
 * Tests: aiWorker processCallAnalysis, CampaignCustomer status logic, transcript+recording saving
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { CallSession, CallReport, Campaign, CampaignCustomer, Customer, sequelize } = require('../src/models');
const { processCallAnalysis } = require('../src/workers/aiWorker');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, label, details = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}${details ? ` — ${details}` : ''}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== FULL INTEGRATION TEST ===\n');
  await sequelize.authenticate();
  console.log('✅ DB connected\n');

  // Use merchant user that has Agent + VobizNumber + Customer in DB
  const { Agent: DBAgent, VobizNumber } = require('../src/models');
  let userId, agentId, vobizNumberId, customerId;

  // Find an agent that also has a VobizNumber on the same userId
  const agents = await DBAgent.findAll({ limit: 10 });
  for (const a of agents) {
    const vn = await VobizNumber.findOne({ where: { userId: a.userId } });
    if (vn) {
      userId = a.userId;
      agentId = a.id;
      vobizNumberId = vn.id;
      break;
    }
  }

  assert(!!userId, 'Found merchant user with agent + vobizNumber');
  assert(!!agentId, 'Found agentId for test sessions');
  assert(!!vobizNumberId, 'Found vobizNumberId for test sessions');
  if (!userId) { await sequelize.close(); return; }

  let sharedCustomer = await Customer.findOne({ where: { userId }, order: [['createdAt', 'DESC']] });
  if (!sharedCustomer) {
    sharedCustomer = await Customer.create({ userId, name: 'Test Integration Customer', mobile: `+91999${Date.now().toString().slice(-7)}` });
  }
  customerId = sharedCustomer.id;
  assert(!!customerId, 'Found/created customer record in DB');

  const mkSession = (overrides = {}) => CallSession.create({
    userId,
    agentId,
    vobizNumberId,
    customerId,
    status: 'completed',
    direction: 'outbound',
    startTime: new Date(Date.now() - 30000),
    endTime: new Date(),
    wsSessionToken: `test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    ...overrides,
  });

  // --- TEST 1: processCallAnalysis creates a CallReport for a fresh session ---
  console.log('\n--- TEST 1: New completed session → CallReport created ---');
  {
    const session = await mkSession();
    const testTranscript = 'Agent: Hello, how can I help you today?\nCustomer: I am interested in your pricing.';
    await processCallAnalysis({
      callSessionId: session.id,
      userId,
      customerId,
      transcript: testTranscript,
      duration: 30,
      recordingUrl: null,
    });

    const report = await CallReport.findOne({ where: { callSessionId: session.id } });
    assert(!!report, 'CallReport created for completed session');
    assert(report?.transcript === testTranscript, 'Transcript saved correctly', `got: "${report?.transcript?.substring(0, 50)}"`);
    assert(report?.duration === 30, 'Duration saved correctly', `got: ${report?.duration}`);
    assert(!!report?.outcome, 'Outcome populated by AI analysis', `got: ${report?.outcome}`);
    assert(!!report?.summary, 'Summary populated by AI analysis');

    // Cleanup
    await report?.destroy();
    await session.destroy();
  }

  // --- TEST 2: processCallAnalysis is idempotent (no duplicate reports) ---
  console.log('\n--- TEST 2: Duplicate call → no duplicate report ---');
  {
    const session = await mkSession();
    const event = { callSessionId: session.id, userId, customerId, transcript: 'Agent: test\nCustomer: ok', duration: 10, recordingUrl: null };
    await processCallAnalysis(event);
    await processCallAnalysis(event); // call twice

    const count = await CallReport.count({ where: { callSessionId: session.id } });
    assert(count === 1, `Exactly 1 CallReport (not duplicate), found: ${count}`);

    await CallReport.destroy({ where: { callSessionId: session.id } });
    await session.destroy();
  }

  // --- TEST 3: CampaignCustomer status set to 'completed' for connected call with any outcome ---
  console.log('\n--- TEST 3: Connected outbound call → CampaignCustomer = completed ---');
  {
    const cust = await Customer.create({ userId, name: 'Test Customer', mobile: `+91800${Date.now().toString().slice(-7)}` });
    const campaignList = await sequelize.query('SELECT id FROM customer_lists LIMIT 1', { type: sequelize.QueryTypes.SELECT });
    const customerListId = campaignList[0]?.id;
    const campaign = await Campaign.create({ userId, agentId, vobizNumberId, customerListId: customerListId || customerId, name: 'Test Campaign', status: 'running', maxConcurrentCalls: 1, startTime: new Date() });
    const cc = await CampaignCustomer.create({ campaignId: campaign.id, customerId: cust.id, callStatus: 'calling', retryCount: 0 });

    const session = await mkSession({
      campaignId: campaign.id,
      customerId: cust.id,
      startTime: new Date(Date.now() - 30000), // had startTime → connected
      endTime: new Date(),
      wsSessionToken: `test-cc-${Date.now()}`,
    });

    await processCallAnalysis({
      callSessionId: session.id,
      userId,
      campaignId: campaign.id,
      customerId: cust.id,
      transcript: '',
      duration: 30,
      recordingUrl: null,
    });

    await cc.reload();
    assert(cc.callStatus === 'completed', `CampaignCustomer.callStatus = 'completed' for connected call`, `got: ${cc.callStatus}`);
    assert(cc.retryCount === 0, `retryCount NOT incremented for connected call`, `got: ${cc.retryCount}`);

    await CallReport.destroy({ where: { callSessionId: session.id } });
    await session.destroy();
    await cc.destroy();
    await campaign.destroy();
    await cust.destroy();
  }

  // --- TEST 4: CampaignCustomer status = 'failed' for never-connected call ---
  console.log('\n--- TEST 4: Never-connected call → CampaignCustomer = failed + retryCount++ ---');
  {
    const cust = await Customer.create({ userId, name: 'Test Customer 2', mobile: `+91801${Date.now().toString().slice(-7)}` });
    const campaignList2 = await sequelize.query('SELECT id FROM customer_lists LIMIT 1', { type: sequelize.QueryTypes.SELECT });
    const customerListId2 = campaignList2[0]?.id;
    const campaign = await Campaign.create({ userId, agentId, vobizNumberId, customerListId: customerListId2 || customerId, name: 'Test Campaign 2', status: 'running', maxConcurrentCalls: 1, startTime: new Date() });
    const cc = await CampaignCustomer.create({ campaignId: campaign.id, customerId: cust.id, callStatus: 'calling', retryCount: 0 });

    const session = await mkSession({
      campaignId: campaign.id,
      customerId: cust.id,
      status: 'failed',
      startTime: null, // never connected
      endTime: new Date(),
      wsSessionToken: `test-cc-fail-${Date.now()}`,
    });

    await processCallAnalysis({
      callSessionId: session.id,
      userId,
      campaignId: campaign.id,
      customerId: cust.id,
      transcript: '',
      duration: 0,
      recordingUrl: null,
    });

    await cc.reload();
    assert(cc.callStatus === 'pending', `CampaignCustomer.callStatus = 'pending' on retry 1 (< maxRetries 3)`, `got: ${cc.callStatus}`);
    assert(cc.retryCount === 1, `retryCount incremented to 1 for never-connected call`, `got: ${cc.retryCount}`);

    // Now simulate reaching max retries (retryCount = 3)
    cc.retryCount = 2; // Next failure will make it 3
    await cc.save();

    const session2 = await mkSession({
      campaignId: campaign.id,
      customerId: cust.id,
      status: 'failed',
      startTime: null,
      endTime: new Date(),
      wsSessionToken: `test-cc-fail-max-${Date.now()}`,
    });

    await processCallAnalysis({
      callSessionId: session2.id,
      userId,
      campaignId: campaign.id,
      customerId: cust.id,
      transcript: '',
      duration: 0,
      recordingUrl: null,
    });

    await cc.reload();
    assert(cc.callStatus === 'failed', `CampaignCustomer.callStatus = 'failed' when max retries reached (retry 3/3)`, `got: ${cc.callStatus}`);

    await CallReport.destroy({ where: { callSessionId: session.id } });
    await CallReport.destroy({ where: { callSessionId: session2.id } });
    await session.destroy();
    await session2.destroy();
    await cc.destroy();
    await campaign.destroy();
    await cust.destroy();
  }

  // --- TEST 5: Recording file saved to correct disk location ---
  console.log('\n--- TEST 5: Recording file path resolution (uploads dir) ---');
  {
    const uploadsDir = path.join(__dirname, '../uploads');
    const exists = fs.existsSync(uploadsDir);
    assert(exists, `uploads directory exists at ${uploadsDir}`);

    if (!exists) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Write a dummy WAV file and verify
    const testFile = path.join(uploadsDir, 'test-recording-check.wav');
    fs.writeFileSync(testFile, Buffer.from('RIFF'));
    assert(fs.existsSync(testFile), 'Can write recording file to uploads directory');
    fs.unlinkSync(testFile);
    assert(!fs.existsSync(testFile), 'Can delete test file after write');
  }

  // --- SUMMARY ---
  console.log(`\n${'='.repeat(40)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('✅ ALL TESTS PASSED');
  } else {
    console.log(`❌ ${failed} TEST(S) FAILED — see above`);
    process.exitCode = 1;
  }

  await sequelize.close();
}

runTests().catch(err => {
  console.error('Test suite crashed:', err);
  process.exit(1);
});
