/**
 * Backfill missing CallReports for completed sessions
 * and fix stuck 'initiated' sessions
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { CallSession, CallReport, sequelize } = require('../src/models');
const { processCallAnalysis } = require('../src/workers/aiWorker');
const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');

async function backfillAndFix() {
  console.log('=== BACKFILL & FIX MISSING REPORTS ===\n');

  try {
    await sequelize.authenticate();
    console.log('✅ DB connected\n');

    // 1. Fix stuck 'initiated' sessions older than 5 minutes → mark failed
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const stuckSessions = await CallSession.findAll({
      where: {
        status: { [Op.in]: ['initiated', 'connected'] },
        createdAt: { [Op.lt]: fiveMinutesAgo },
      },
    });

    console.log(`Found ${stuckSessions.length} stuck sessions to fix...`);
    for (const s of stuckSessions) {
      const hasReport = await CallReport.findOne({ where: { callSessionId: s.id } });
      if (!hasReport) {
        console.log(`  Fixing stuck session: ${s.id} [${s.status}] -> failed`);
        s.status = 'failed';
        s.endTime = new Date();
        await s.save();

        // Create a failed report
        await processCallAnalysis({
          callSessionId: s.id,
          userId: s.userId,
          campaignId: s.campaignId,
          vobizNumberId: s.vobizNumberId,
          customerId: s.customerId,
          transcript: '',
          duration: 0,
          recordingUrl: null,
        }).catch(e => console.error(`  Error creating report for ${s.id}:`, e.message));
      }
    }

    // 2. Backfill missing reports for completed sessions
    const completedSessions = await CallSession.findAll({
      where: {
        status: { [Op.in]: ['completed', 'failed'] },
      },
      order: [['endTime', 'DESC']],
      limit: 50,
    });

    let missingCount = 0;
    for (const s of completedSessions) {
      const hasReport = await CallReport.findOne({ where: { callSessionId: s.id } });
      if (!hasReport) {
        missingCount++;
        const duration = s.startTime && s.endTime
          ? Math.max(0, Math.round((new Date(s.endTime) - new Date(s.startTime)) / 1000))
          : 0;

        const recFile = `recording-${s.id}.wav`;
        const recPath = path.join(__dirname, '../uploads', recFile);
        const recExists = fs.existsSync(recPath);

        console.log(`  Backfilling report for session: ${s.id} [${s.direction} | ${s.status}] duration:${duration}s rec:${recExists}`);

        await processCallAnalysis({
          callSessionId: s.id,
          userId: s.userId,
          campaignId: s.campaignId,
          vobizNumberId: s.vobizNumberId,
          customerId: s.customerId,
          transcript: '',
          duration,
          recordingUrl: recExists ? `/uploads/${recFile}` : null,
        }).catch(e => console.error(`  Error creating report for ${s.id}:`, e.message));
      }
    }

    if (missingCount === 0) {
      console.log('✅ All completed/failed sessions already have reports!');
    } else {
      console.log(`\n✅ Backfilled ${missingCount} missing reports.`);
    }

    // 3. Verify coverage
    console.log('\n=== POST-FIX COVERAGE ===');
    const last10 = await CallSession.findAll({
      order: [['createdAt', 'DESC']],
      limit: 10,
    });

    for (const s of last10) {
      const report = await CallReport.findOne({ where: { callSessionId: s.id } });
      const hasTranscript = report && report.transcript && report.transcript.length > 10;
      console.log(`  ${report ? '✅' : '❌'} Session ${s.id.substring(0, 8)}... [${s.direction}|${s.status}] → ${report ? `Report: ${report.outcome}, transcript: ${hasTranscript ? report.transcript.length + 'chars' : 'empty'}` : 'NO REPORT'}`);
    }

    console.log('\n=== DONE ===');
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

backfillAndFix();
