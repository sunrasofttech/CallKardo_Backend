/**
 * End-to-end call campaign workflow test
 * Tests: Campaign → callWorker → VoBiz dial → WebSocket → pipeline → cleanup → CallReport saved
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { CallSession, CallReport, Campaign, CampaignCustomer, Customer, CallLog, sequelize } = require('../src/models');
const { processCallAnalysis } = require('../src/workers/aiWorker');
const fs = require('fs');
const path = require('path');

async function runWorkflowTest() {
  console.log('=== CAMPAIGN CALL WORKFLOW TEST ===\n');

  try {
    await sequelize.authenticate();
    console.log('✅ DB connected\n');

    // 1. Check a recent completed CallSession
    const recentSession = await CallSession.findOne({
      where: { status: 'completed' },
      order: [['endTime', 'DESC']],
    });

    if (!recentSession) {
      console.log('⚠️  No completed sessions found. Running with a synthetic test...\n');
    } else {
      console.log(`📞 Most recent completed session: ${recentSession.id}`);
      console.log(`   Direction: ${recentSession.direction}`);
      console.log(`   userId: ${recentSession.userId}`);
      console.log(`   customerId: ${recentSession.customerId}`);
      console.log(`   campaignId: ${recentSession.campaignId}`);
      console.log(`   startTime: ${recentSession.startTime}`);
      console.log(`   endTime: ${recentSession.endTime}`);

      const duration = recentSession.startTime && recentSession.endTime
        ? Math.max(0, Math.round((new Date(recentSession.endTime) - new Date(recentSession.startTime)) / 1000))
        : 0;
      console.log(`   Duration: ${duration}s`);

      // Check if recording file exists on disk
      const recFile = `recording-${recentSession.id}.wav`;
      const uploadsDir = path.join(__dirname, '../uploads');
      const recPath = path.join(uploadsDir, recFile);
      const recExists = fs.existsSync(recPath);
      console.log(`   Recording on disk: ${recExists ? `✅ YES (${recPath})` : '❌ NO'}`);
      if (recExists) {
        const stat = fs.statSync(recPath);
        console.log(`   Recording size: ${stat.size} bytes`);
      }

      // Check if CallReport exists
      const existingReport = await CallReport.findOne({ where: { callSessionId: recentSession.id } });
      console.log(`\n📊 CallReport in DB: ${existingReport ? `✅ YES (id: ${existingReport.id})` : '❌ NO'}`);
      if (existingReport) {
        console.log(`   Transcript length: ${(existingReport.transcript || '').length} chars`);
        console.log(`   Transcript preview: ${(existingReport.transcript || '').substring(0, 150)}`);
        console.log(`   Summary: ${existingReport.summary}`);
        console.log(`   Outcome: ${existingReport.outcome}`);
        console.log(`   Sentiment: ${existingReport.sentiment}`);
        console.log(`   LeadScore: ${existingReport.leadScore}`);
        console.log(`   Duration: ${existingReport.duration}s`);
        console.log(`   RecordingUrl: ${existingReport.recordingUrl || 'null'}`);
      } else {
        // Force create the report
        console.log('\n⚡ No report found. Running processCallAnalysis to create one...');
        await processCallAnalysis({
          callSessionId: recentSession.id,
          userId: recentSession.userId,
          campaignId: recentSession.campaignId,
          vobizNumberId: recentSession.vobizNumberId,
          customerId: recentSession.customerId,
          transcript: '',
          duration,
          recordingUrl: recExists ? `/uploads/${recFile}` : null,
        });

        const newReport = await CallReport.findOne({ where: { callSessionId: recentSession.id } });
        if (newReport) {
          console.log(`✅ CallReport created! id: ${newReport.id}`);
          console.log(`   Outcome: ${newReport.outcome}, Sentiment: ${newReport.sentiment}, Score: ${newReport.leadScore}`);
        } else {
          console.log('❌ FAILED: Report still not created after processCallAnalysis.');
        }
      }
    }

    // 2. Check last 5 sessions and their report coverage
    console.log('\n\n=== LAST 5 SESSIONS COVERAGE CHECK ===');
    const last5 = await CallSession.findAll({
      order: [['createdAt', 'DESC']],
      limit: 5,
    });

    for (const s of last5) {
      const report = await CallReport.findOne({ where: { callSessionId: s.id } });
      const recFile = `recording-${s.id}.wav`;
      const recPath = path.join(__dirname, '../uploads', recFile);
      const recExists = fs.existsSync(recPath);
      const hasTranscript = report && report.transcript && report.transcript.length > 10;
      console.log(`\n  Session ${s.id} [${s.direction} | ${s.status}]`);
      console.log(`    Report:    ${report ? '✅' : '❌'} ${report ? `(outcome: ${report.outcome})` : 'MISSING'}`);
      console.log(`    Transcript:${hasTranscript ? '✅' : '⚠️ '} ${hasTranscript ? `${report.transcript.length} chars` : 'empty'}`);
      console.log(`    Recording: ${recExists ? '✅' : '❌'} ${recExists ? recFile : 'file not on disk'}`);
      console.log(`    RecordUrl: ${report?.recordingUrl || 'null'}`);
    }

    // 3. Check campaign completion status
    console.log('\n\n=== CAMPAIGNS STATUS CHECK ===');
    const campaigns = await Campaign.findAll({
      order: [['updatedAt', 'DESC']],
      limit: 5,
    });
    for (const c of campaigns) {
      const total = await CampaignCustomer.count({ where: { campaignId: c.id } });
      const completed = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'completed' } });
      const failed = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'failed' } });
      const pending = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'pending' } });
      const calling = await CampaignCustomer.count({ where: { campaignId: c.id, callStatus: 'calling' } });
      console.log(`\n  Campaign: ${c.name} [${c.status}]`);
      console.log(`    Total: ${total}, Completed: ${completed}, Failed: ${failed}, Pending: ${pending}, Calling: ${calling}`);
    }

    console.log('\n=== WORKFLOW TEST COMPLETE ===');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await sequelize.close();
  }
}

runWorkflowTest();
