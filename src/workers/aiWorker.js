const { duplicateClient } = require('../config/redis');
const AiAnalysisService = require('../services/aiAnalysisService');
const SubscriptionService = require('../services/subscriptionService');
const QueueService = require('../services/queueService');
const { CallReport, CallSession, Customer, CampaignCustomer, Campaign, sequelize } = require('../models');

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
 * Invokes Gemini, saves CallReport, adjusts campaign progress and plan limits.
 * Handles both inbound and outbound calls reliably.
 */
async function processCallAnalysis(event) {
  const { callSessionId, transcript, duration, recordingUrl } = event;

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

    // 2. Fetch the full CallSession from DB (single source of truth for IDs)
    const session = await CallSession.findByPk(callSessionId);
    if (!session) {
      console.warn(`[AI Worker] CallSession ${callSessionId} not found in DB. Cannot create report.`);
      return;
    }

    // Resolve all foreign keys from session first, then fall back to event payload
    let finalUserId = session.userId || event.userId;
    let finalVobizNumberId = session.vobizNumberId || event.vobizNumberId;
    let finalCustomerId = session.customerId || event.customerId;
    let finalCampaignId = session.campaignId || event.campaignId;

    // 3. Auto-resolve customer for inbound calls if customerId is still missing
    if (!finalCustomerId && finalUserId) {
      try {
        const { Op } = require('sequelize');
        // Try to find customer by caller number
        const callerNum = session.fromNumber || session.toNumber || '';
        if (callerNum) {
          const cleanNum = callerNum.replace(/^\+91/, '').replace(/\D/g, '');
          const searchConditions = [{ mobile: callerNum }];
          if (cleanNum) searchConditions.push({ mobile: { [Op.like]: `%${cleanNum}` } });

          let cust = await Customer.findOne({
            where: {
              userId: finalUserId,
              [Op.or]: searchConditions,
            },
          });

          if (!cust) {
            // Create a new customer record for the inbound caller
            cust = await Customer.create({
              userId: finalUserId,
              mobile: callerNum || 'Unknown',
              name: 'Inbound Caller',
            });
            console.log(`[AI Worker] Created new Customer record for inbound caller: ${callerNum}`);
          }
          finalCustomerId = cust.id;
        }
      } catch (custErr) {
        console.warn(`[AI Worker] Customer auto-resolution failed: ${custErr.message}`);
      }
    }

    // Update session with resolved customerId if it was missing
    if (finalCustomerId && !session.customerId) {
      try {
        session.customerId = finalCustomerId;
        await session.save();
      } catch (_) {}
    }

    if (!finalUserId) {
      console.warn(`[AI Worker] Skipping CallReport creation for session ${callSessionId}: userId could not be resolved.`);
      return;
    }

    // 4. Determine the transcript to analyze
    // Prefer the transcript passed in the event, but if empty, try to build from session data
    const finalTranscript = (transcript && transcript.trim().length > 0) ? transcript : '';

    // 5. Trigger Gemini Transcript Analysis
    const analysis = await AiAnalysisService.analyzeTranscript(finalTranscript);
    console.log(`[AI Analysis Result] Session: ${callSessionId} -> Outcome: ${analysis.outcome}, Score: ${analysis.leadScore}, Direction: ${session.direction}`);

    // 6. Save CallReport in DB idempotently
    const [report, created] = await CallReport.findOrCreate({
      where: { callSessionId },
      defaults: {
        userId: finalUserId,
        campaignId: finalCampaignId,
        vobizNumberId: finalVobizNumberId,
        customerId: finalCustomerId,
        transcript: finalTranscript,
        summary: analysis.summary,
        duration: duration || 0,
        outcome: analysis.outcome,
        sentiment: analysis.sentiment,
        leadScore: analysis.leadScore,
        recordingUrl: recordingUrl || null,
      },
    });

    if (!created) {
      console.log(`CallReport for session ${callSessionId} was already created by another worker. Skipping.`);
      return;
    }

    console.log(`[AI Worker] CallReport created successfully for session ${callSessionId} (${session.direction}). CustomerId: ${finalCustomerId || 'none'}, Transcript length: ${finalTranscript.length}`);

    // 7. Deduct call credit from merchant's subscription
    if (finalUserId) {
      try {
        await SubscriptionService.recordCallUsage(finalUserId);
      } catch (subErr) {
        console.warn(`[AI Worker] Failed to record call usage for user ${finalUserId}: ${subErr.message}`);
      }
    }

    // 8. Update campaign customer status (only for outbound campaign calls)
    if (finalCampaignId && finalCustomerId) {
      const isFailed = (analysis.outcome === 'No Answer' || analysis.outcome === 'Wrong Number');
      const callStatus = isFailed ? 'failed' : 'completed';

      const mapping = await CampaignCustomer.findOne({
        where: { campaignId: finalCampaignId, customerId: finalCustomerId },
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

      const remainingCalling = await CampaignCustomer.count({
        where: { campaignId: finalCampaignId, callStatus: 'calling' },
      });

      const activeCalls = await QueueService.getActiveCalls(finalCampaignId);

      if (remainingPending === 0 && remainingCalling === 0 && activeCalls === 0) {
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
