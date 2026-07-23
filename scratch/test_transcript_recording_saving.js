require('dotenv').config();
const { User, Agent, VobizNumber, Customer, CallSession, CallReport, sequelize } = require('../src/models');
const { processCallAnalysis } = require('../src/workers/aiWorker');
const reportController = require('../src/controllers/reportController');
const fs = require('fs');
const path = require('path');

async function testTranscriptAndRecordingSaving() {
  console.log('--- Testing Transcript & Recording Saving ---');
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // 1. Get or create test merchant
    let user = await User.findOne({ where: { role: 'merchant' } });
    if (!user) {
      user = await User.create({
        email: `test_report_${Date.now()}@example.com`,
        passwordHash: 'hashedpass',
        role: 'merchant',
        businessName: 'Report Test Merchant',
      });
    }
    console.log('Using merchant user:', user.email, user.id);

    let agent = await Agent.findOne({ where: { userId: user.id } });
    if (!agent) agent = await Agent.findOne();
    if (!agent) {
      agent = await Agent.create({
        userId: user.id,
        name: 'Test Agent',
        systemPrompt: 'Default prompt',
        approvalStatus: 'approved',
      });
    }

    let number = await VobizNumber.findOne({ where: { userId: user.id } });
    if (!number) number = await VobizNumber.findOne();
    if (!number) {
      number = await VobizNumber.create({
        userId: user.id,
        number: '+919999999999',
        vobizCallUuid: 'test-uuid-123',
        status: 'active',
      });
    }

    let customer = await Customer.findOne({ where: { userId: user.id } });
    if (!customer) customer = await Customer.findOne();
    if (!customer) {
      customer = await Customer.create({
        userId: user.id,
        name: 'Test Customer',
        mobile: '+919876543210',
      });
    }

    // 2. Create a test CallSession
    const session = await CallSession.create({
      userId: user.id,
      agentId: agent.id,
      vobizNumberId: number.id,
      customerId: customer.id,
      wsSessionToken: `token_${Date.now()}`,
      fromNumber: customer.mobile,
      toNumber: number.number,
      direction: 'outbound',
      status: 'completed',
      startTime: new Date(Date.now() - 30000),
      endTime: new Date(),
    });
    console.log('Created test CallSession:', session.id);

    // Create dummy recording file on disk
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const testRecFile = `recording-${session.id}.wav`;
    const testRecPath = path.join(uploadsDir, testRecFile);
    fs.writeFileSync(testRecPath, Buffer.from('RIFF mock wav file content'));
    console.log('Created mock recording file:', testRecFile);

    // 3. Fire processCallAnalysis with full transcript and recording URL
    const testTranscript = "Agent: Hello, calling from CallKardo! How can I help?\nCustomer: Yes, I want to inquire about your pricing plans.\nAgent: Great! Our plans start at $49 per month.\nCustomer: Perfect, please email me the details.";
    const completionEvent = {
      callSessionId: session.id,
      userId: user.id,
      agentId: agent.id,
      vobizNumberId: number.id,
      customerId: customer.id,
      transcript: testTranscript,
      duration: 30,
      recordingUrl: `/uploads/${testRecFile}`,
    };

    console.log('\nProcessing call analysis...');
    await processCallAnalysis(completionEvent);

    // 4. Verify CallReport in Database
    const savedReport = await CallReport.findOne({ where: { callSessionId: session.id } });
    console.log('\n--- Database CallReport Inspection ---');
    console.log('Saved Report ID:', savedReport?.id);
    console.log('Saved Transcript Length:', savedReport?.transcript?.length);
    console.log('Saved Transcript Preview:', savedReport?.transcript?.substring(0, 100));
    console.log('Saved Summary:', savedReport?.summary);
    console.log('Saved Outcome:', savedReport?.outcome);
    console.log('Saved Recording URL:', savedReport?.recordingUrl);

    if (!savedReport) {
      throw new Error('CallReport was not saved to database!');
    }
    if (!savedReport.transcript || savedReport.transcript.length === 0) {
      throw new Error('Transcript was not saved in CallReport!');
    }
    if (savedReport.recordingUrl !== `/uploads/${testRecFile}`) {
      throw new Error(`Recording URL mismatch! Expected /uploads/${testRecFile}, got ${savedReport.recordingUrl}`);
    }

    // 5. Test reportController API output
    const mockRes = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return this; }
    };
    const mockReq = { user: { id: user.id, role: 'merchant' }, query: {}, params: { sessionId: session.id } };

    console.log('\nTesting reportController.getReportBySession...');
    await reportController.getReportBySession(mockReq, mockRes, (err) => { if (err) throw err; });

    console.log('API Response Status:', mockRes.statusCode);
    console.log('API Report Transcript:', mockRes.data?.data?.transcript?.substring(0, 100));
    console.log('API Report Recording URL:', mockRes.data?.data?.recordingUrl);

    if (mockRes.statusCode !== 200 || !mockRes.data?.data?.recordingUrl) {
      throw new Error('Report API did not return recordingUrl!');
    }

    console.log('\n--- ALL TRANSCRIPT & RECORDING TESTS PASSED SUCCESSFULLY ---');

    // Clean up mock recording file
    if (fs.existsSync(testRecPath)) fs.unlinkSync(testRecPath);
  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

testTranscriptAndRecordingSaving();
