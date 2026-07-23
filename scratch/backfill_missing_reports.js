require('dotenv').config();
const { CallSession, CallReport, sequelize } = require('../src/models');
const { processCallAnalysis } = require('../src/workers/aiWorker');
const fs = require('fs');
const path = require('path');

async function backfillMissingReports() {
  console.log('--- Backfilling Missing Call Reports ---');
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const sessions = await CallSession.findAll({
      order: [['createdAt', 'DESC']],
    });

    console.log(`Found ${sessions.length} total CallSessions.`);
    let backfilledCount = 0;

    for (const session of sessions) {
      const existingReport = await CallReport.findOne({ where: { callSessionId: session.id } });
      if (!existingReport) {
        let duration = 0;
        if (session.startTime && session.endTime) {
          duration = Math.max(0, Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000));
        }

        const recFile = `recording-${session.id}.wav`;
        const recPath = path.join(process.cwd(), 'uploads', recFile);
        const recordingUrl = fs.existsSync(recPath) ? `/uploads/${recFile}` : null;

        const event = {
          callSessionId: session.id,
          userId: session.userId,
          campaignId: session.campaignId,
          vobizNumberId: session.vobizNumberId,
          customerId: session.customerId,
          transcript: '',
          duration,
          recordingUrl,
        };

        await processCallAnalysis(event);
        backfilledCount++;
      }
    }

    console.log(`Successfully backfilled ${backfilledCount} missing CallReports.`);
  } catch (err) {
    console.error('Backfill error:', err);
  } finally {
    await sequelize.close();
  }
}

backfillMissingReports();
