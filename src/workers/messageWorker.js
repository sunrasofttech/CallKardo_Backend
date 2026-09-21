const { duplicateClient } = require('../config/redis');
const QueueService = require('../services/queueService');
const ActionService = require('../services/actionService');
const { AlternateContactRequest } = require('../models');
const { Op } = require('sequelize');

const RECOVERY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const STALE_REQUEST_AGE_MS = 10 * 60 * 1000;

let lastRecoverySweep = 0;

/**
 * Processes outbound messaging jobs pushed during live calls
 * (e.g. customer asked to send details to a friend's / alternate number).
 */
async function startMessageWorker() {
  console.log('Message Worker started.');

  const client = await duplicateClient();

  while (true) {
    try {
      if (Date.now() - lastRecoverySweep >= RECOVERY_SWEEP_INTERVAL_MS) {
        lastRecoverySweep = Date.now();
        await recoverStaleRequests();
      }

      const jobData = await client.blPop(QueueService.MESSAGE_QUEUE, 30);
      if (!jobData) {
        continue;
      }

      const parsed = JSON.parse(jobData.element);
      console.log(`[Message Worker] Processing ${parsed.type} job: ${JSON.stringify(parsed.payload)}`);

      if (parsed.type === 'ALTERNATE_NUMBER_MESSAGE') {
        await ActionService.processAlternateNumberRequest(parsed.payload.requestId);
      } else {
        console.warn(`[Message Worker] Unknown job type: ${parsed.type}`);
      }
    } catch (error) {
      console.error('Error in Message Worker execution:', error);
    }
  }
}

/**
 * Re-enqueue requests that never got processed (Redis push failed after the DB
 * insert, or the worker died mid-processing). Retries that are waiting in the
 * scheduler are left alone because their updatedAt is refreshed on each attempt.
 */
async function recoverStaleRequests() {
  try {
    const staleRequests = await AlternateContactRequest.findAll({
      where: {
        requestType: 'send_details',
        status: { [Op.in]: ['pending', 'processing'] },
        updatedAt: { [Op.lt]: new Date(Date.now() - STALE_REQUEST_AGE_MS) },
      },
      attributes: ['id'],
      limit: 100,
    });

    for (const request of staleRequests) {
      // Static update also bumps updatedAt, so the next sweep won't re-enqueue it before it is processed
      await AlternateContactRequest.update({ status: 'pending' }, { where: { id: request.id } });
      await QueueService.enqueueMessageJob('ALTERNATE_NUMBER_MESSAGE', { requestId: request.id });
      console.log(`[Message Worker] Re-enqueued stale alternate number request ${request.id}`);
    }
  } catch (err) {
    console.error('[Message Worker] Recovery sweep failed:', err.message);
  }
}

module.exports = { startMessageWorker };

if (require.main === module) {
  startMessageWorker();
}
