const defaults = require('../config/defaults');
const { sendEmail } = require('../utils/email');
const { normalizeMobile } = require('../utils/phone');

class ActionService {
  /**
   * Helper: Generate standard iCalendar (.ics) event structure for Nodemailer
   */
  _generateIcalInvite({ summary, description, location, startTime, durationMinutes = 30, organizerEmail }) {
    const start = startTime || new Date(Date.now() + 30 * 60 * 1000); // 30 mins from now
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    const formatDate = (date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const nowStr = formatDate(new Date());
    const startStr = formatDate(start);
    const endStr = formatDate(end);
    const uid = `meeting-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@callkardo.com`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'PRODID:-//CallKardo//AI Meeting Scheduler//EN',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStr}`,
      `DTSTART:${startStr}`,
      `DTEND:${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      `ORGANIZER;CN=CallKardo AI:mailto:${organizerEmail || 'ai@callkardo.com'}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT15M',
      'ACTION:DISPLAY',
      'DESCRIPTION:Reminder',
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return {
      filename: 'invite.ics',
      method: 'REQUEST',
      content: icsContent,
    };
  }

  /**
   * Helper: Resolve valid customer email address with DB fallback
   */
  async _resolveCustomerEmail(customer, merchant) {
    if (customer?.email && customer.email.includes('@') && !customer.email.includes('example.com')) {
      return customer.email;
    }
    try {
      const { Customer } = require('../models');
      let found = null;
      if (customer?.id) {
        found = await Customer.findByPk(customer.id);
      } else if (customer?.mobile) {
        found = await Customer.findOne({
          where: {
            mobile: customer.mobile,
            ...(merchant?.id && { userId: merchant.id }),
          }
        });
      }
      if (found && found.email && found.email.includes('@') && !found.email.includes('example.com')) {
        return found.email;
      }
    } catch (err) {
      // ignore
    }
    return null;
  }

  /**
   * Helper: Get approved messaging info (credentials & channel mode) for a merchant
   */
  async _getMerchantMessagingInfo(merchantId) {
    if (!merchantId) return null;
    try {
      const { MerchantMessageProgram } = require('../models');
      const program = await MerchantMessageProgram.findOne({
        where: { user_id: merchantId, status: 'approved' },
        order: [['updated_at', 'DESC']]
      });
      if (program && program.credentials) {
        return {
          credentials: program.credentials,
          channel_mode: program.channel_mode || 'rcs',
        };
      }
    } catch (err) {
      console.error(`[ActionService] Error fetching merchant program info:`, err);
    }
    return null;
  }

  /**
   * Helper: Get approved external template_id for a merchant and master template slug
   */
  async _getApprovedTemplateId(merchantId, masterTemplateSlug) {
    if (!merchantId) return null;
    try {
      const { MessageTemplate, MasterMessageTemplate } = require('../models');
      const template = await MessageTemplate.findOne({
        where: { user_id: merchantId, status: 'approved' },
        include: [{
          model: MasterMessageTemplate,
          as: 'masterTemplate',
          where: { slug: masterTemplateSlug }
        }]
      });
      if (template && template.template_id) {
        return template.template_id;
      }
    } catch (err) {
      console.error(`[ActionService] Error fetching approved template ID for ${masterTemplateSlug}:`, err);
    }
    return null;
  }

  /**
   * Handle Join Link action
   */
  async sendJoinLink(customer, agent, merchant) {
    const mobile = customer?.mobile || 'Unknown';
    const name = customer?.name || 'Customer';
    const customerEmail = await this._resolveCustomerEmail(customer, merchant);
    const merchantEmail = merchant?.email || defaults.smtp.from;
    
    // Generate unique Jitsi room link unless overridden by env
    const roomId = 'CallKardo-Join-' + Math.random().toString(36).substring(2, 8);
    const joinLink = process.env.DEFAULT_JOIN_LINK || `https://meet.jit.si/${roomId}`;

    const summary = `Session Join Link - ${agent?.name || 'AI Receptionist'}`;
    const description = `Hi ${name},\n\nHere is your meeting room link:\n${joinLink}\n\nBest regards,\n${agent?.name || 'AI Receptionist'}`;
    const icalEvent = this._generateIcalInvite({
      summary,
      description,
      location: joinLink,
      organizerEmail: merchantEmail
    });

    if (customerEmail) {
      console.log(`[Action: send_join_link] Sending join link to customer ${name} (${customerEmail}), CC: ${merchantEmail}`);

      await sendEmail({
        to: customerEmail,
        cc: merchantEmail,
        subject: summary,
        text: description,
        icalEvent,
      });
    } else {
      console.log(`[Action: send_join_link] No customer email. Sending join link directly to merchant at ${merchantEmail}`);

      await sendEmail({
        to: merchantEmail,
        subject: `[CallKardo Alert] Join Link requested by customer ${name}`,
        text: `Customer ${name} (${mobile}) requested a join link during their call with Agent "${agent?.name || 'AI Agent'}".\n\nLink: ${joinLink}\n\n(This email was sent to you because the customer did not have a registered email address.)`,
        icalEvent,
      });
    }

    if (mobile !== 'Unknown') {
      try {
        const msgInfo = await this._getMerchantMessagingInfo(merchant?.id);
        if (!msgInfo) {
          console.log(`[Action: send_join_link] Skipping messaging: Merchant not verified or missing credentials.`);
        } else if (['rcs', 'both', 'whatsapp'].includes(msgInfo.channel_mode)) {
          const templateId = await this._getApprovedTemplateId(merchant?.id, 'join_link');
          if (!templateId) {
            console.log(`[Action: send_join_link] Skipping: No approved 'join_link' template found for merchant.`);
          } else {
            const DovesoftService = require('./dovesoftService');
            // Fire and forget message
            DovesoftService.sendRCS(mobile, templateId, {
              user_name: name,
              app_link: joinLink,
              website_url: 'https://callkardo.com',
              support_mobile: merchant?.mobile || ''
            }, msgInfo.credentials).catch(err => console.error(`[Action: send_join_link] Messaging failed: ${err.message}`));
          }
        }
      } catch (err) {
        console.error(`[Action: send_join_link] Failed to initiate messaging to ${mobile}:`, err.message);
      }
    }

    return { success: true, joinLink };
  }

  /**
   * Handle WhatsApp Hi action
   */
  async sendWhatsAppHi(customer) {
    const mobile = customer?.mobile || 'Unknown';
    const name = customer?.name || 'Customer';

    console.log(`[Action: send_whatsapp_hi] Sending WhatsApp greeting to ${name} (${mobile})`);

    // Simulate sending WhatsApp message
    return { success: true, message: 'WhatsApp greeting sent' };
  }

  /**
   * Handle Send Email action
   */
  async sendCustomerEmail(customer, agent, merchant, subjectText, bodyText) {
    const name = customer?.name || 'Customer';
    const customerEmail = await this._resolveCustomerEmail(customer, merchant);
    const merchantEmail = merchant?.email || defaults.smtp.from || 'alerts@callkardo.com';

    if (customerEmail) {
      console.log(`[Action: send_email] Sending info to customer ${name} (${customerEmail}), CC: ${merchantEmail}`);

      await sendEmail({
        to: customerEmail,
        cc: merchantEmail,
        subject: subjectText || `Information from ${agent?.name || 'AI Agent'}`,
        text: bodyText || `Hi ${name},\n\nHere are the details we discussed during our call.\n\nBest regards,\n${agent?.name || 'AI Agent'}`,
      });
    } else {
      console.log(`[Action: send_email] No customer email. Sending info directly to merchant at ${merchantEmail}`);

      await sendEmail({
        to: merchantEmail,
        subject: `[CallKardo Alert] Info requested by customer ${name}`,
        text: `Customer ${name} requested information during a call with Agent "${agent?.name || 'AI Agent'}".\n\nContent:\n${bodyText || 'General information requested.'}\n\n(This email was sent to you because the customer did not have a registered email address.)`,
      });
    }

    return { success: true };
  }

  /**
   * Helper: Parse requested meeting time string into Javascript Date
   */
  _parseRequestedMeetingTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
      const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      defaultDate.setHours(10, 0, 0, 0);
      return {
        dateObj: defaultDate,
        displayStr: 'Scheduled Meeting'
      };
    }

    const lower = timeStr.toLowerCase().trim();
    let targetDate = new Date();

    if (lower.includes('tomorrow') || lower.includes('kal')) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    // Extract hour e.g. "5pm", "5:00 pm", "17:00", "10am"
    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      targetDate.setHours(10, 0, 0, 0);
    }

    // Ensure future date
    if (targetDate.getTime() <= Date.now()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    return {
      dateObj: targetDate,
      displayStr: timeStr
    };
  }

  /**
   * Handle Schedule Meeting action
   */
  async scheduleMeeting(customer, agent, merchant, meetingTimeStr, callSessionId = null) {
    const name = customer?.name || 'Customer';
    const mobile = customer?.mobile || 'Unknown';
    const customerEmail = await this._resolveCustomerEmail(customer, merchant);
    const merchantEmail = merchant?.email || defaults.smtp.from;

    const parsedTime = this._parseRequestedMeetingTime(meetingTimeStr);
    const formattedDate = new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(parsedTime.dateObj);
    const timeLabel = `for ${formattedDate}`;

    // Generate dynamic unique Jitsi Meet room link unless overridden by env
    const roomId = 'CallKardo-Meet-' + Math.random().toString(36).substring(2, 8);
    const meetingLink = process.env.DEFAULT_MEETING_LINK || `https://meet.jit.si/${roomId}`;

    // If this call is with a Merchant (e.g. Onboarding or direct Admin call)
    // Or if agent is a merchant-calling agent, delegate directly to MerchantOnboardingService
    const MerchantOnboardingService = require('./merchantOnboardingService');
    const targetMerchantId = (agent?.isMerchantCaller || !customer?.id) ? (customer?.id || merchant?.id) : (customer?.id || merchant?.id);

    try {
      if (targetMerchantId) {
        await MerchantOnboardingService.scheduleMeeting(targetMerchantId, meetingTimeStr, callSessionId, agent?.id);
      }
    } catch (schedErr) {
      console.error('[ActionService] Error saving Meeting record:', schedErr.message);
    }

    const summary = `Scheduled Meeting ${timeLabel} - ${agent?.name || 'AI Receptionist'}`;
    const description = `Hi ${name},\n\nYour meeting has been successfully scheduled ${timeLabel}.\n\nYou can join the meeting room here:\n\n${meetingLink}\n\nBest regards,\n${agent?.name || 'AI Receptionist'}`;

    const icalEvent = this._generateIcalInvite({
      summary,
      description,
      location: meetingLink,
      startTime: parsedTime.dateObj,
      organizerEmail: merchantEmail
    });

    if (customerEmail) {
      console.log(`[Action: schedule_meeting] Scheduling meeting for ${name} (${timeLabel}). Link: ${meetingLink}. Target: ${customerEmail}, CC: ${merchantEmail}`);

      // Send email to customer, CC merchant, with .ics calendar invite
      await sendEmail({
        to: customerEmail,
        cc: merchantEmail,
        subject: summary,
        text: description,
        icalEvent,
      });
    } else {
      console.log(`[Action: schedule_meeting] No customer email. Sending meeting link directly to merchant at ${merchantEmail}`);

      // Send directly to merchant ONLY
      await sendEmail({
        to: merchantEmail,
        subject: `[CallKardo Alert] Meeting Scheduled (${timeLabel}) with ${name}`,
        text: `A meeting was scheduled (${timeLabel}) during a call with ${name} (${mobile}) by Agent "${agent?.name || 'AI Agent'}".\n\nMeeting Link: ${meetingLink}\n\n(This email was sent to you because the customer did not have a registered email address.)`,
        icalEvent,
      });
    }

    if (mobile !== 'Unknown') {
      try {
        const msgInfo = await this._getMerchantMessagingInfo(merchant?.id);
        if (!msgInfo) {
          console.log(`[Action: schedule_meeting] Skipping messaging: Merchant not verified or missing credentials.`);
        } else if (['rcs', 'both', 'whatsapp'].includes(msgInfo.channel_mode)) {
          const templateId = await this._getApprovedTemplateId(merchant?.id, 'meeting_link');
          if (!templateId) {
            console.log(`[Action: schedule_meeting] Skipping: No approved 'meeting_link' template found for merchant.`);
          } else {
            const DovesoftService = require('./dovesoftService');
            // Fire and forget message
            DovesoftService.sendRCS(mobile, templateId, {
              user_name: name,
              app_link: meetingLink,
              website_url: 'https://callkardo.com',
              support_mobile: merchant?.mobile || ''
            }, msgInfo.credentials).catch(err => console.error(`[Action: schedule_meeting] Messaging failed: ${err.message}`));
          }
        }
      } catch (err) {
        console.error(`[Action: schedule_meeting] Failed to initiate messaging to ${mobile}:`, err.message);
      }
    }

    return { success: true, meetingLink, scheduledTime: timeLabel };
  }

  /**
   * Handle Request Callback action with 6hr delay and night avoidance
   */
  async requestCallback(customer, agent, merchant, meetingTimeStr, callSessionId = null) {
    const name = customer?.name || 'Customer';
    const mobile = customer?.mobile || 'Unknown';
    const merchantEmail = merchant?.email || defaults.smtp.from;

    const MerchantOnboardingService = require('./merchantOnboardingService');
    const targetMerchantId = (agent?.isMerchantCaller || !customer?.id) ? (customer?.id || merchant?.id) : (customer?.id || merchant?.id);

    let callbackResult = null;
    if (targetMerchantId) {
      try {
        callbackResult = await MerchantOnboardingService.scheduleCallback(targetMerchantId, meetingTimeStr, callSessionId, agent?.id);
      } catch (cbErr) {
        console.error('[ActionService] Error scheduling callback via MerchantOnboardingService:', cbErr.message);
      }
    }

    const scheduledTimeDisplay = callbackResult?.scheduledTime || meetingTimeStr || 'in 6 hours (business hours)';

    console.log(`[Action: request_callback] Callback requested by ${name} (${scheduledTimeDisplay}). Sending alert to merchant/admin at ${merchantEmail}`);

    await sendEmail({
      to: merchantEmail,
      subject: `[CallKardo Alert] Callback Requested (${scheduledTimeDisplay}) with ${name}`,
      text: `Customer/Merchant ${name} (${mobile}) has requested a callback for ${scheduledTimeDisplay} during their call with Agent "${agent?.name || 'AI Agent'}".\n\nNighttime restriction policy applied: Call will be placed during active business hours (9:00 AM - 9:00 PM IST).\n\nDetails:\nName: ${name}\nMobile: ${mobile}`,
    });

    return { success: true, scheduledTime: scheduledTimeDisplay };
  }

  /**
   * Handle Send Website Link action
   */
  async sendWebsiteLink(customer, agent, merchant) {
    const mobile = customer?.mobile || 'Unknown';
    const name = customer?.name || 'Customer';
    const businessUrl = merchant?.businessUrl;

    if (!businessUrl) {
      console.log(`[Action: send_website_link] No businessUrl found for merchant, skipping RCS.`);
      return { success: false, message: 'No business website configured' };
    }

    if (mobile !== 'Unknown') {
      try {
        const msgInfo = await this._getMerchantMessagingInfo(merchant?.id);
        if (!msgInfo) {
          console.log(`[Action: send_website_link] Skipping messaging: Merchant not verified or missing credentials.`);
        } else if (['rcs', 'both', 'whatsapp'].includes(msgInfo.channel_mode)) {
          const templateId = await this._getApprovedTemplateId(merchant?.id, 'website_link');
          if (!templateId) {
            console.log(`[Action: send_website_link] Skipping: No approved 'website_link' template found for merchant.`);
          } else {
            const DovesoftService = require('./dovesoftService');
            // Fire and forget message
            DovesoftService.sendRCS(mobile, templateId, {
              user_name: name,
              app_link: businessUrl,
              website_url: businessUrl,
              support_mobile: merchant?.mobile || ''
            }, msgInfo.credentials).catch(err => console.error(`[Action: send_website_link] Messaging failed: ${err.message}`));
          }
        }
      } catch (err) {
        console.error(`[Action: send_website_link] Failed to initiate messaging to ${mobile}:`, err.message);
      }
    }

    return { success: true, websiteLink: businessUrl };
  }

  /**
   * Helper: Parse "{{action:send_to_alternate_number:<number>:<content_type>}}" payload.
   * Order-insensitive and tolerant of spaces/dashes the LLM may put inside the number.
   */
  _parseAlternateNumberPayload(payload) {
    const segments = String(payload || '').split(':').map(s => s.trim()).filter(Boolean);
    let rawNumber = null;
    let contentType = 'details';

    for (const segment of segments) {
      const digits = segment.replace(/\D/g, '');
      if (!rawNumber && digits.length >= 10) {
        rawNumber = segment;
      } else if (ALTERNATE_CONTENT_TYPES.includes(segment.toLowerCase())) {
        contentType = segment.toLowerCase();
      }
    }

    return { rawNumber, contentType };
  }

  /**
   * Helper: Validate and normalize an alternate mobile number spoken by the customer.
   * Returns the normalized number, or null if it is not a plausible mobile number.
   */
  _validateAlternateMobile(rawNumber) {
    if (!rawNumber) return null;
    const normalized = normalizeMobile(rawNumber);
    if (normalized.startsWith('+91')) {
      return /^\+91[6-9]\d{9}$/.test(normalized) ? normalized : null;
    }
    return /^\+\d{11,15}$/.test(normalized) ? normalized : null;
  }

  /**
   * Helper: Send an approved template message and wait for the result
   * (unlike the fire-and-forget sends above, the caller needs to know the outcome).
   * @returns {{ sent: boolean, permanent?: boolean, reason?: string, data?: object }}
   */
  async _sendTemplateMessage(merchantId, mobile, masterTemplateSlug, customParams) {
    const msgInfo = await this._getMerchantMessagingInfo(merchantId);
    if (!msgInfo) {
      return { sent: false, permanent: true, reason: 'Merchant messaging not verified or missing credentials' };
    }
    if (!['rcs', 'both', 'whatsapp'].includes(msgInfo.channel_mode)) {
      return { sent: false, permanent: true, reason: `Messaging disabled (channel_mode: ${msgInfo.channel_mode})` };
    }
    const templateId = await this._getApprovedTemplateId(merchantId, masterTemplateSlug);
    if (!templateId) {
      return { sent: false, permanent: true, reason: `No approved '${masterTemplateSlug}' template found for merchant` };
    }

    const DovesoftService = require('./dovesoftService');
    const response = await DovesoftService.sendRCS(mobile, templateId, customParams, msgInfo.credentials);
    return { sent: true, data: response?.data };
  }

  /**
   * Handle Send To Alternate Number action.
   * Stores the alternate number the customer gave (friend / family / second phone)
   * and queues the actual message send so it runs in the background.
   */
  async queueAlternateNumberRequest(customer, agent, merchant, actionPayload, callSessionId = null) {
    const { rawNumber, contentType } = this._parseAlternateNumberPayload(actionPayload);
    const prepared = await this._prepareAlternateContact('send_to_alternate_number', customer, agent, merchant, rawNumber, actionPayload, callSessionId);
    if (prepared.error) return prepared.error;

    const { AlternateContactRequest } = require('../models');
    const request = await AlternateContactRequest.create({
      ...prepared.fields,
      requestType: 'send_details',
      contentType,
    });

    console.log(`[Action: send_to_alternate_number] Stored request ${request.id}: send ${contentType} to ${request.alternateMobile} (customer ${request.customerName || 'Unknown'}, ${request.originalMobile || 'Unknown'})`);

    try {
      const QueueService = require('./queueService');
      await QueueService.enqueueMessageJob('ALTERNATE_NUMBER_MESSAGE', { requestId: request.id });
    } catch (err) {
      // The row stays 'pending'; the message worker's recovery sweep will pick it up.
      console.error(`[Action: send_to_alternate_number] Failed to enqueue request ${request.id}: ${err.message}`);
    }

    return { success: true, queued: true, requestId: request.id, alternateMobile: request.alternateMobile, contentType };
  }

  /**
   * Handle Request Callback On Alternate Number action.
   * Payload: "<number>:<requested_date_and_time>" (time may itself contain ':' e.g. "5:30pm").
   * Stores the request and schedules the call; the call worker dials the alternate
   * number at that time and the agent continues from the previous conversation.
   */
  async requestCallbackOnAlternateNumber(customer, agent, merchant, actionPayload, callSessionId = null) {
    const segments = String(actionPayload || '').split(':');
    const numberIndex = segments.findIndex(seg => seg.replace(/\D/g, '').length >= 10);
    const rawNumber = numberIndex >= 0 ? segments[numberIndex] : null;
    const requestedTime = segments.filter((_, i) => i !== numberIndex).join(':').trim() || ALTERNATE_CALLBACK_DEFAULT_TIME;

    const prepared = await this._prepareAlternateContact('request_callback_alternate_number', customer, agent, merchant, rawNumber, actionPayload, callSessionId);
    if (prepared.error) return prepared.error;

    const MerchantOnboardingService = require('./merchantOnboardingService');
    const { scheduledTime, isNightAdjusted } = MerchantOnboardingService.calculateCallbackTime(requestedTime, new Date());
    const timeLabel = MerchantOnboardingService.formatDateTimeIST(scheduledTime);

    const { AlternateContactRequest } = require('../models');
    const request = await AlternateContactRequest.create({
      ...prepared.fields,
      requestType: 'callback',
      contentType: 'callback',
      requestedTime,
      scheduledTime,
      status: 'scheduled',
    });

    const QueueService = require('./queueService');
    await QueueService.scheduleJob('ALTERNATE_NUMBER_CALLBACK', { requestId: request.id }, scheduledTime.getTime());

    console.log(`[Action: request_callback_alternate_number] Request ${request.id}: call back ${request.customerName || 'Customer'} on ${request.alternateMobile} at ${timeLabel}${isNightAdjusted ? ' (night-adjusted)' : ''}`);

    const ctx = request.context || {};
    try {
      await sendEmail({
        to: ctx.merchantEmail || defaults.smtp.from,
        subject: `[CallKardo Alert] Callback on another number (${request.alternateMobile}) scheduled for ${timeLabel}`,
        text: `Customer ${request.customerName || 'Customer'} (${request.originalMobile || 'Unknown'}) asked Agent "${ctx.agentName || 'AI Agent'}" to call them back on a different number: ${request.alternateMobile}.\n\nThe AI agent will call ${request.alternateMobile} at ${timeLabel}${isNightAdjusted ? ' (shifted to business hours due to night calling policy)' : ''} and continue the conversation.`,
      });
    } catch (err) {
      console.error(`[Action: request_callback_alternate_number] Failed to email merchant: ${err.message}`);
    }

    return { success: true, requestId: request.id, alternateMobile: request.alternateMobile, scheduledTime: timeLabel };
  }

  /**
   * Helper: Validate the alternate number and build the common AlternateContactRequest fields.
   * @returns {{ error: object } | { fields: object }}
   */
  async _prepareAlternateContact(actionName, customer, agent, merchant, rawNumber, actionPayload, callSessionId) {
    const alternateMobile = this._validateAlternateMobile(rawNumber);
    if (!alternateMobile) {
      console.log(`[Action: ${actionName}] Invalid or missing alternate number in payload "${actionPayload}". Skipping.`);
      return { error: { success: false, message: 'Invalid or missing alternate mobile number' } };
    }

    const originalMobile = customer?.mobile ? normalizeMobile(customer.mobile) : null;
    if (originalMobile && originalMobile === alternateMobile) {
      console.log(`[Action: ${actionName}] Alternate number is the same as the customer's own number. Skipping.`);
      return { error: { success: false, message: 'Alternate number is same as the customer number' } };
    }

    const { Customer } = require('../models');
    // On merchant-onboarding calls the "customer" is a merchant User, not a Customer row
    const customerRow = customer?.id ? await Customer.findByPk(customer.id, { attributes: ['id'] }) : null;

    return {
      fields: {
        merchantId: merchant?.id || null,
        customerId: customerRow ? customerRow.id : null,
        agentId: agent?.id || null,
        callSessionId,
        customerName: customer?.name || null,
        originalMobile,
        alternateMobile,
        context: {
          agentName: agent?.name || null,
          merchantEmail: merchant?.email || null,
          merchantMobile: merchant?.mobile || null,
          merchantBusinessName: merchant?.businessName || null,
          merchantBusinessUrl: merchant?.businessUrl || null,
        },
      },
    };
  }

  /**
   * Background processor for an AlternateContactRequest (called by the message worker).
   * Sends the requested content to the alternate number and alerts the merchant
   * once the request reaches a final state.
   */
  async processAlternateNumberRequest(requestId) {
    const { AlternateContactRequest } = require('../models');
    const request = await AlternateContactRequest.findByPk(requestId);
    if (!request) {
      console.warn(`[AlternateNumber] Request ${requestId} not found.`);
      return;
    }
    if (['sent', 'failed'].includes(request.status)) {
      console.log(`[AlternateNumber] Request ${requestId} already ${request.status}. Skipping.`);
      return;
    }

    await request.update({ status: 'processing', attempts: request.attempts + 1 });

    const ctx = request.context || {};
    const name = request.customerName || 'Customer';
    const businessUrl = ctx.merchantBusinessUrl;
    const baseParams = {
      user_name: name,
      website_url: businessUrl || 'https://callkardo.com',
      support_mobile: ctx.merchantMobile || '',
    };

    let outcome;
    try {
      if (request.contentType === 'join_link') {
        const roomId = 'CallKardo-Join-' + Math.random().toString(36).substring(2, 8);
        const joinLink = process.env.DEFAULT_JOIN_LINK || `https://meet.jit.si/${roomId}`;
        outcome = await this._sendTemplateMessage(request.merchantId, request.alternateMobile, 'join_link', { ...baseParams, app_link: joinLink });
        if (outcome.sent) outcome.link = joinLink;
      } else if (businessUrl) {
        // 'website_link' and generic 'details' both go out as the merchant's website link template
        outcome = await this._sendTemplateMessage(request.merchantId, request.alternateMobile, 'website_link', { ...baseParams, app_link: businessUrl });
        if (outcome.sent) outcome.link = businessUrl;
      } else {
        outcome = { sent: false, permanent: true, reason: 'No business website configured to send' };
      }
    } catch (err) {
      outcome = { sent: false, permanent: false, reason: err.message };
    }

    if (outcome.sent) {
      await request.update({ status: 'sent', lastError: null, result: { link: outcome.link, provider: outcome.data || null }, processedAt: new Date() });
      console.log(`[AlternateNumber] Request ${requestId}: sent ${request.contentType} to ${request.alternateMobile}`);
      await this._notifyMerchantAlternateRequest(request);
      return;
    }

    const canRetry = !outcome.permanent && request.attempts < ALTERNATE_MAX_ATTEMPTS;
    if (canRetry) {
      const delayMs = ALTERNATE_RETRY_BASE_MS * Math.pow(2, request.attempts - 1);
      await request.update({ status: 'pending', lastError: outcome.reason });
      const QueueService = require('./queueService');
      await QueueService.scheduleJob('ALTERNATE_NUMBER_MESSAGE', { requestId: request.id }, Date.now() + delayMs);
      console.warn(`[AlternateNumber] Request ${requestId} attempt ${request.attempts} failed (${outcome.reason}). Retrying in ${delayMs / 1000}s.`);
      return;
    }

    await request.update({ status: 'failed', lastError: outcome.reason, processedAt: new Date() });
    console.warn(`[AlternateNumber] Request ${requestId} failed permanently: ${outcome.reason}`);
    await this._notifyMerchantAlternateRequest(request);
  }

  /**
   * Helper: Email the merchant so a human can follow up on the alternate number,
   * especially when the automated message could not be delivered.
   */
  async _notifyMerchantAlternateRequest(request) {
    const ctx = request.context || {};
    const merchantEmail = ctx.merchantEmail || defaults.smtp.from;
    const name = request.customerName || 'Customer';
    const delivered = request.status === 'sent';

    if (request.requestType === 'callback') {
      try {
        await sendEmail({
          to: merchantEmail,
          subject: `[CallKardo Alert] Callback to ${name} on another number (${request.alternateMobile}) failed`,
          text: `Customer ${name} (${request.originalMobile || 'Unknown'}) asked Agent "${ctx.agentName || 'AI Agent'}" to call them back on a different number: ${request.alternateMobile}.\n\nThe automatic callback could NOT be placed (${request.lastError || 'unknown reason'}). Please follow up with the customer on ${request.alternateMobile}.`,
        });
      } catch (err) {
        console.error(`[AlternateNumber] Failed to email merchant for request ${request.id}: ${err.message}`);
      }
      return;
    }

    try {
      await sendEmail({
        to: merchantEmail,
        subject: `[CallKardo Alert] ${name} asked for details on another number (${request.alternateMobile})`,
        text: `Customer ${name} (${request.originalMobile || 'Unknown'}) asked Agent "${ctx.agentName || 'AI Agent'}" to send ${request.contentType.replace(/_/g, ' ')} to a different number: ${request.alternateMobile}.\n\n`
          + (delivered
            ? `The message was sent automatically to ${request.alternateMobile}.`
            : `The message could NOT be sent automatically (${request.lastError || 'unknown reason'}). Please follow up with the customer on ${request.alternateMobile}.`),
      });
    } catch (err) {
      console.error(`[AlternateNumber] Failed to email merchant for request ${request.id}: ${err.message}`);
    }
  }
}

const ALTERNATE_CONTENT_TYPES = ['details', 'website_link', 'join_link'];
const ALTERNATE_MAX_ATTEMPTS = 3;
const ALTERNATE_RETRY_BASE_MS = 60 * 1000;
const ALTERNATE_CALLBACK_DEFAULT_TIME = 'in 2 minutes';

module.exports = new ActionService();
