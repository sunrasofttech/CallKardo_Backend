const { duplicateClient } = require('../config/redis');
const AiAnalysisService = require('../services/aiAnalysisService');
const SubscriptionService = require('../services/subscriptionService');
const QueueService = require('../services/queueService');
const { CallReport, CampaignCustomer, Campaign, sequelize } = require('../models');

async function startAiWorker() {
  console.log('AI Worker started.');

  const client = await duplicateClient();
  const REPORT_QUEUE = 'report_queue';

  while (true) {
    try {
      const jobData = await client.blPop(REPORT_QUEUE, 30);
      if (!jobData) {
        continue;
      }

      const event = JSON.parse(jobData.element);
      console.log(`AI Worker picked up completed call session: ${event.callSessionId}`);

      await processCallAnalysis(event);
    } catch (err) {
      console.error('AI Worker failed to process queue event:', err);
    }
  }
}

/**
 * Invokes Gemini, saves CallReport, adjusts campaign progress and plan limits
 */
async function processCallAnalysis(event) {
  const { callSessionId, userId, campaignId, vobizNumberId, customerId, transcript, duration, recordingUrl } = event;

  try {
    if (!callSessionId) {
      console.warn('[AI Worker] Missing callSessionId on completion event. Cannot save CallReport.');
      return;
    }

    // 1. Idempotency Check: check if CallReport already exists for this session
    const existingReport = await CallReport.findOne({ where: { callSessionId } });
    if (existingReport) {
      console.log(`CallReport for session ${callSessionId} already exists. Skipping.`);
      return;
    }

    // Auto-resolve missing fields from CallSession
    let finalUserId = userId;
    let finalVobizNumberId = vobizNumberId;
    let finalCustomerId = customerId;
    let finalCampaignId = campaignId;

    const { CallSession, Customer } = require('../models');
    const session = await CallSession.findByPk(callSessionId);
    if (session) {
      if (!finalUserId) finalUserId = session.userId;
      if (!finalVobizNumberId) finalVobizNumberId = session.vobizNumberId;
      if (!finalCustomerId) finalCustomerId = session.customerId;
      if (!finalCampaignId) finalCampaignId = session.campaignId;

      // Auto-resolve customer if still missing
      if (!finalCustomerId && finalUserId) {
        const callerNum = session.fromNumber || 'Inbound Caller';
        let cust = await Customer.findOne({ where: { userId: finalUserId, mobile: callerNum } });
        if (!cust) {
          cust = await Customer.create({ userId: finalUserId, mobile: callerNum, name: 'Inbound Caller' });
        }
        finalCustomerId = cust.id;
      }
    }

    if (!finalUserId) {
      console.warn(`[AI Worker] Skipping CallReport creation for session ${callSessionId}: userId could not be resolved.`);
      return;
    }

    // 2. Trigger Gemini Transcript Analysis
    const analysis = await AiAnalysisService.analyzeTranscript(transcript);
    console.log(`[AI Analysis Result] Session: ${callSessionId} -> Outcome: ${analysis.outcome}, Score: ${analysis.leadScore}`);

    // 3. Save CallReport in DB idempotently
    const [report, created] = await CallReport.findOrCreate({
      where: { callSessionId },
      defaults: {
        userId: finalUserId,
        campaignId: finalCampaignId,
        vobizNumberId: finalVobizNumberId,
        customerId: finalCustomerId,
        transcript: transcript || '',
        summary: analysis.summary,
        duration: duration || 0,
        outcome: analysis.outcome,
        sentiment: analysis.sentiment,
        leadScore: analysis.leadScore,
        recordingUrl,
      }
    });

    if (!created) {
      console.log(`CallReport for session ${callSessionId} was already created by another worker. Skipping.`);
      return;
    }

    // 4. Deduct call credit from merchant's subscription
    if (finalUserId) {
      await SubscriptionService.recordCallUsage(finalUserId);
    }

    // 5. Update campaign customer status
    if (finalCampaignId && finalCustomerId) {
      const isFailed = (analysis.outcome === 'No Answer' || analysis.outcome === 'Wrong Number');
      const callStatus = isFailed ? 'failed' : 'completed';

      const mapping = await CampaignCustomer.findOne({
        where: { campaignId: finalCampaignId, customerId: finalCustomerId }
      });

      if (mapping) {
        mapping.callStatus = callStatus;
        if (isFailed) {
          mapping.retryCount = (mapping.retryCount || 0) + 1;
        }
        await mapping.save();
      }

      // Check if all campaign customers have been processed
      const remainingPending = await CampaignCustomer.count({
        where: { campaignId: finalCampaignId, callStatus: 'pending' },
      });

      const activeCalls = await QueueService.getActiveCalls(finalCampaignId);

      if (remainingPending === 0 && activeCalls === 0) {
        // Mark campaign as completed
        const campaign = await Campaign.findByPk(finalCampaignId);
        if (campaign && campaign.status === 'running') {
          campaign.status = 'completed';
          await campaign.save();
          console.log(`Campaign ${campaign.name} (${finalCampaignId}) has no pending calls remaining. Marked Completed.`);
        }
      }
    }

  } catch (dbErr) {
    console.error(`DB Update Error in AI worker for session ${callSessionId}:`, dbErr);
  }
}

if (require.main === module) {
  startAiWorker();
}

module.exports = {
  startAiWorker,
  processCallAnalysis,
};
