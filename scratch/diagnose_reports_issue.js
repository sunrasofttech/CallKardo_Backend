require('dotenv').config();
const { CallSession, CallReport, User, sequelize } = require('../src/models');

async function diagnose() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    console.log('\n--- Recent 10 Call Sessions ---');
    const sessions = await CallSession.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
    });

    for (const s of sessions) {
      const report = await CallReport.findOne({ where: { callSessionId: s.id } });
      console.log({
        sessionId: s.id,
        direction: s.direction,
        status: s.status,
        userId: s.userId,
        vobizNumberId: s.vobizNumberId,
        customerId: s.customerId,
        createdAt: s.createdAt,
        hasReport: !!report,
        reportId: report?.id,
        transcriptLength: report?.transcript?.length || 0,
        recordingUrl: report?.recordingUrl || null,
        summary: report?.summary,
      });
    }

    console.log('\n--- Recent 10 Call Reports ---');
    const reports = await CallReport.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
    });
    for (const r of reports) {
      console.log({
        reportId: r.id,
        sessionId: r.callSessionId,
        userId: r.userId,
        outcome: r.outcome,
        transcriptLen: r.transcript?.length || 0,
        recordingUrl: r.recordingUrl,
        summary: r.summary,
        createdAt: r.createdAt,
      });
    }
  } catch (err) {
    console.error('Diagnosis error:', err);
  } finally {
    await sequelize.close();
  }
}

diagnose();
