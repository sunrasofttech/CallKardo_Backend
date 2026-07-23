require('dotenv').config();
const { CallSession, CallReport, Customer, Campaign, VobizNumber, sequelize } = require('../src/models');
const { processCallAnalysis } = require('../src/workers/aiWorker');

async function backfillInboundReports() {
  try {
    await sequelize.authenticate();
    console.log('--- BACKFILLING MISSING INBOUND CALL REPORTS ---');

    // Find all inbound sessions
    const inboundSessions = await CallSession.findAll({
      where: { direction: 'inbound' },
      order: [['createdAt', 'DESC']],
    });

    console.log(`Found ${inboundSessions.length} total inbound call sessions in DB.`);

    for (const session of inboundSessions) {
      const existingReport = await CallReport.findOne({ where: { callSessionId: session.id } });
      if (existingReport) {
        console.log(`[EXISTS] Report already exists for Inbound Session ${session.id}`);
        continue;
      }

      console.log(`[CREATING] Generating report for Inbound Session ${session.id} (Customer: ${session.customerId})...`);

      const duration = (session.startTime && session.endTime)
        ? Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000)
        : 0;

      const completionEvent = {
        callSessionId: session.id,
        userId: session.userId,
        campaignId: session.campaignId || null,
        vobizNumberId: session.vobizNumberId,
        customerId: session.customerId,
        transcript: 'Inbound Call completed.',
        duration: duration,
        recordingUrl: null,
      };

      await processCallAnalysis(completionEvent);
      console.log(`[SUCCESS] CallReport created for Inbound Session ${session.id}`);
    }

    console.log('\nInbound Call Reports Backfill Complete!');

  } catch (err) {
    console.error('Backfill Error:', err);
  } finally {
    await sequelize.close();
  }
}

backfillInboundReports();
