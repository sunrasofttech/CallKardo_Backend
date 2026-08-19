const { duplicateClient } = require('../config/redis');
const AiAnalysisService = require('../services/aiAnalysisService');
const SubscriptionService = require('../services/subscriptionService');
const QueueService = require('../services/queueService');
const { CallReport, CallSession, Customer, CampaignCustomer, Campaign, sequelize } = require('../models');
const NotificationService = require('../services/notificationService');

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

    // 1. Fetch the full CallSession from DB (single source of truth for IDs)
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

    // Fallback: If finalUserId is still missing, try looking up VobizNumber or Agent or default user
    if (!finalUserId && finalVobizNumberId) {
      const { VobizNumber } = require('../models');
      const vn = await VobizNumber.findByPk(finalVobizNumberId);
      if (vn && vn.userId) finalUserId = vn.userId;
    }
    if (!finalUserId && session.agentId) {
      const { Agent: DBAgent } = require('../models');
      const ag = await DBAgent.findByPk(session.agentId);
      if (ag && ag.userId) finalUserId = ag.userId;
    }
    if (!finalUserId) {
      const { User } = require('../models');
      const defaultUser = await User.findOne({ where: { role: 'merchant' } });
      if (defaultUser) finalUserId = defaultUser.id;
    }

    const finalTranscript = (transcript && transcript.trim().length > 0) ? transcript : '';

    // Check if CallReport already exists for this session
    const existingReport = await CallReport.findOne({ where: { callSessionId } });
    if (existingReport) {
      let needsUpdate = false;

      // Update transcript if incoming is longer/more detailed or existing is empty
      if (finalTranscript && (!existingReport.transcript || existingReport.transcript.length < finalTranscript.length)) {
        existingReport.transcript = finalTranscript;
        needsUpdate = true;
      }
      // Update recording URL if existing is missing and incoming is provided
      if (recordingUrl && !existingReport.recordingUrl) {
        existingReport.recordingUrl = recordingUrl;
        needsUpdate = true;
      }
      // Update duration if incoming is longer
      if (duration && duration > (existingReport.duration || 0)) {
        existingReport.duration = duration;
        needsUpdate = true;
      }
      // Update customer ID if existing is missing
      if (finalCustomerId && !existingReport.customerId) {
        existingReport.customerId = finalCustomerId;
        needsUpdate = true;
      }

      if (needsUpdate) {
        if (existingReport.transcript && existingReport.transcript.trim().length > 0) {
          const analysis = await AiAnalysisService.analyzeTranscript(existingReport.transcript);
          existingReport.summary = analysis.summary;
          existingReport.outcome = analysis.outcome;
          existingReport.sentiment = analysis.sentiment;
          existingReport.leadScore = analysis.leadScore;
        }
        await existingReport.save();
        console.log(`[AI Worker] Updated existing CallReport for session ${callSessionId} with new transcript/recordingUrl.`);
      } else {
        console.log(`CallReport for session ${callSessionId} already exists and is up to date.`);
      }
      return;
    }

    // 2. Auto-resolve customer for inbound calls if customerId is still missing
    if (!finalCustomerId && finalUserId) {
      try {
        const { Op } = require('sequelize');
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

    if (finalCustomerId && !session.customerId) {
      try {
        session.customerId = finalCustomerId;
        await session.save();
      } catch (_) { }
    }

    if (!finalUserId) {
      console.warn(`[AI Worker] Skipping CallReport creation for session ${callSessionId}: userId could not be resolved.`);
      return;
    }

    // 3. Trigger Gemini Transcript Analysis
    const analysis = await AiAnalysisService.analyzeTranscript(finalTranscript);
    console.log(`[AI Analysis Result] Session: ${callSessionId} -> Outcome: ${analysis.outcome}, Score: ${analysis.leadScore}, Direction: ${session.direction}`);

    // 3b. Safety net: the live voice model sometimes tells the customer a meeting was
    // scheduled without ever emitting the {{action:schedule_meeting}} trigger token, so
    // no email goes out. If the post-call transcript analysis independently concludes the
    // outcome was 'Appointment Booked' but no schedule_meeting action ever ran during the
    // call, send the confirmation email now as a fallback.
    if (analysis.outcome === 'Appointment Booked') {
      try {
        const { Op } = require('sequelize');
        const { CallLog, Agent: DBAgent, User: DBUser } = require('../models');
        const alreadyHandled = await CallLog.findOne({
          where: {
            callSessionId,
            message: { [Op.like]: '%schedule_meeting%' },
          },
        });

        if (!alreadyHandled) {
          const agentRecord = session.agentId ? await DBAgent.findByPk(session.agentId) : null;
          const merchantRecord = finalUserId ? await DBUser.findByPk(finalUserId) : null;
          const customerRecord = finalCustomerId ? await Customer.findByPk(finalCustomerId) : null;
          const ActionService = require('../services/actionService');

          await ActionService.scheduleMeeting(customerRecord, agentRecord, merchantRecord, null);
          await CallLog.create({
            callSessionId,
            logLevel: 'info',
            message: '[AI Worker] Safety-net: sent meeting-schedule email (schedule_meeting action was never triggered live).',
          }).catch(() => { });
          console.log(`[AI Worker] Safety-net meeting email sent for session ${callSessionId}.`);
        }
      } catch (safetyErr) {
        console.error(`[AI Worker] Safety-net schedule_meeting email failed for session ${callSessionId}:`, safetyErr.message);
        const { CallLog } = require('../models');
        await CallLog.create({
          callSessionId,
          logLevel: 'error',
          message: `[AI Worker] Safety-net schedule_meeting email failed: ${safetyErr.message}`,
        }).catch(() => { });
      }
    }

    // 4. Save CallReport in DB idempotently
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
      await report.update({
        ...(finalTranscript && (!report.transcript || report.transcript.length < finalTranscript.length) && { transcript: finalTranscript, summary: analysis.summary, outcome: analysis.outcome, sentiment: analysis.sentiment, leadScore: analysis.leadScore }),
        ...(recordingUrl && !report.recordingUrl && { recordingUrl }),
        ...(duration && duration > (report.duration || 0) && { duration }),
        ...(finalCustomerId && !report.customerId && { customerId: finalCustomerId }),
      });
    }

    console.log(`[AI Worker] CallReport created successfully for session ${callSessionId} (${session.direction}). CustomerId: ${finalCustomerId || 'none'}, Transcript length: ${finalTranscript.length}`);

    // Notify Merchant of Call Report Generation
    if (created && finalUserId) {
      await NotificationService.notifyMerchant(
        finalUserId,
        'Call Report Generated',
        `A new call report was generated for a recent call. Outcome: ${analysis.outcome}`,
        'call'
      );
    }

    // Notify Merchant if action is required (e.g. Meeting or Callback)
    // We check this even if updated, assuming we want to notify whenever the outcome is set to these
    if (analysis.outcome === 'Callback Requested' || analysis.outcome === 'Appointment Booked') {
      await NotificationService.notifyMerchant(
        finalUserId,
        `Action Required: ${analysis.outcome}`,
        `A customer from a recent call (Session: ${callSessionId}) resulted in: ${analysis.outcome}. Please review the call report.`,
        'meeting'
      );
    }


    // 7. Deduct call credit from merchant's subscription
    if (created && finalUserId) {
      try {
        await SubscriptionService.recordCallUsage(finalUserId);
      } catch (subErr) {
        console.warn(`[AI Worker] Failed to record call usage for user ${finalUserId}: ${subErr.message}`);
      }
    }

    // 8. Update campaign customer status (only for outbound campaign calls)
    if (finalCampaignId && finalCustomerId) {
      // Use session status as the primary indicator
      const sessionNeverConnected = (session.status === 'failed' && !session.startTime);
      const isNoAnswer = (analysis.outcome === 'No Answer');
      const isWrongNumber = (analysis.outcome === 'Wrong Number');

      // A call is a true failure/retry-eligible if it never connected OR if the outcome is 'No Answer'
      // (meaning the agent failed to connect or the customer hung up without speaking).
      // Wrong number is considered completed if it connected.
      const callStatus = (sessionNeverConnected || isNoAnswer || (isWrongNumber && !session.startTime)) ? 'failed' : 'completed';

      const campaign = await Campaign.findByPk(finalCampaignId);
      const maxRetries = campaign?.maxRetries || 3;

      const mapping = await CampaignCustomer.findOne({
        where: { campaignId: finalCampaignId, customerId: finalCustomerId },
      });

      if (mapping) {
        if (mapping.callStatus === 'calling' || mapping.callStatus === 'pending') {
          if (callStatus === 'failed') {
            const newRetry = (mapping.retryCount || 0) + 1;
            mapping.retryCount = newRetry;
            if (newRetry < maxRetries) {
              mapping.callStatus = 'pending'; // Retry eligible
              console.log(`[AI Worker] Call failed/no answer. Resetting customer ${finalCustomerId} to 'pending' (retry ${newRetry}/${maxRetries})`);
            } else {
              mapping.callStatus = 'failed'; // Max retries reached
              console.log(`[AI Worker] Call failed/no answer. Max retries reached for customer ${finalCustomerId} (${newRetry}/${maxRetries}). Marked 'failed'.`);
            }
          } else {
            mapping.callStatus = 'completed';
            console.log(`[AI Worker] Connected call completed. CampaignCustomer updated: campaign=${finalCampaignId} customer=${finalCustomerId} → completed`);
          }
          await mapping.save();
        } else {
          console.log(`[AI Worker] CampaignCustomer already in final state: ${mapping.callStatus} — skipping update.`);
        }
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
    if (callSessionId) {
      const { CallLog } = require('../models');
      await CallLog.create({
        callSessionId,
        logLevel: 'error',
        message: `AI Worker failed to create/update CallReport: ${dbErr.message}`,
      }).catch(() => { });
    }
  }
}

if (require.main === module) {
  startAiWorker();
}

module.exports = {
  startAiWorker,
  processCallAnalysis,
};
