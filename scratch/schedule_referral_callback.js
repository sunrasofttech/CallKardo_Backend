/**
 * One-off: schedule the referral call merchant "thakur" (87d7133b-...) asked for on
 * 2026-09-22 in session 96f2f137-..., which the agent promised but never triggered.
 *
 * Run ON THE SERVER (it must use the server's Redis) after deploying the referral fix:
 *   node scratch/schedule_referral_callback.js
 */
require('dotenv').config();
const { AlternateContactRequest, CallSession, User, sequelize } = require('../src/models');
const QueueService = require('../src/services/queueService');
const defaults = require('../src/config/defaults');
const { normalizeMobile } = require('../src/utils/phone');

const MERCHANT_ID = '87d7133b-0bf0-4a4a-ab05-f16d2b86cb36';
const ORIGINAL_SESSION_ID = '96f2f137-8024-4a0e-9f93-e711ff38c862';
const REFERRAL_MOBILE = '9960727921';
const DELAY_MS = 2 * 60 * 1000;

async function main() {
  await sequelize.authenticate();

  const merchant = await User.findByPk(MERCHANT_ID);
  const session = await CallSession.findByPk(ORIGINAL_SESSION_ID);
  if (!merchant || !session) throw new Error('Merchant or original session not found');

  const alternateMobile = normalizeMobile(REFERRAL_MOBILE);
  const existing = await AlternateContactRequest.findOne({ where: { callSessionId: session.id, alternateMobile } });
  if (existing) {
    console.log(`Request already exists: ${existing.id} (status ${existing.status}). Nothing to do.`);
    return;
  }

  const scheduledTime = new Date(Date.now() + DELAY_MS);
  const request = await AlternateContactRequest.create({
    merchantId: session.adminId || null, // merchant calls: the "merchant" side is the admin
    customerId: null,
    agentId: session.agentId,
    callSessionId: session.id,
    customerName: merchant.businessName || 'Partner',
    originalMobile: normalizeMobile(merchant.mobile),
    alternateMobile,
    requestType: 'callback',
    contentType: 'referral',
    requestedTime: 'in 2 minutes',
    scheduledTime,
    status: 'scheduled',
    context: { agentName: null, merchantEmail: defaults.smtp.from, merchantMobile: null },
  });

  await QueueService.scheduleJob('ALTERNATE_NUMBER_CALLBACK', { requestId: request.id }, scheduledTime.getTime());
  console.log(`Scheduled referral call ${request.id} to ${alternateMobile} at ${scheduledTime.toISOString()}`);
}

main()
  .catch((err) => { console.error('Failed:', err.message); process.exitCode = 1; })
  .finally(() => setTimeout(() => process.exit(), 500));
