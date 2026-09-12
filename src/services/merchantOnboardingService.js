const { User, Admin, Agent, Voice, Meeting, MerchantCallback, CallSession, sequelize } = require('../models');
const QueueService = require('./queueService');
const NotificationService = require('./notificationService');
const defaults = require('../config/defaults');
const { sendEmail } = require('../utils/email');

class MerchantOnboardingService {
  /**
   * Helper: Check if a given Date is during night hours in IST (21:00 to 09:00 Asia/Kolkata)
   * @param {Date} date
   * @returns {boolean}
   */
  isNightTime(date) {
    const d = date || new Date();
    // Convert UTC time to IST (UTC + 5.5 hours)
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffsetMs);
    const istHours = istDate.getUTCHours();
    return istHours >= 21 || istHours < 9;
  }

  /**
   * Helper: If date falls in night hours (21:00 - 09:00 IST), adjust it to 10:00 AM IST next morning.
   * @param {Date} date
   * @returns {Date}
   */
  adjustIfNight(date) {
    const d = new Date(date || Date.now());
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(d.getTime() + istOffsetMs);
    const istHours = istDate.getUTCHours();

    if (istHours >= 21 || istHours < 9) {
      // Determine target day in IST
      const targetIst = new Date(istDate.getTime());
      if (istHours >= 21) {
        // Night of current day: move to next day 10:00 AM IST
        targetIst.setUTCDate(targetIst.getUTCDate() + 1);
      }
      // Set to 10:00:00.000 IST
      targetIst.setUTCHours(10, 0, 0, 0);

      // Convert back to UTC date
      return new Date(targetIst.getTime() - istOffsetMs);
    }

    return d;
  }

  /**
   * Helper: Format Date for Indian timezone display
   * @param {Date} date
   * @returns {string}
   */
  formatDateTimeIST(date) {
    if (!date) return '';
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(new Date(date));
  }

  /**
   * Resolve or automatically seed a high-converting default Merchant Onboarding Agent
   * @param {string} [adminId]
   * @returns {Promise<Agent>}
   */
  async getOrCreateDefaultMerchantAgent(adminId = null) {
    // 1. Check for existing active merchant-calling agent
    let agent = await Agent.findOne({
      where: {
        isMerchantCaller: true,
        activeStatus: true,
      },
      order: [['createdAt', 'DESC']],
    });

    if (agent) return agent;

    // 2. Lookup any voice for default agent
    let voice = await Voice.findOne();
    if (!voice) {
      voice = await Voice.create({
        name: 'Aditi',
        provider: 'sarvam',
        voiceId: 'aditi',
        gender: 'female',
        language: 'hi',
      });
    }

    // 3. Create default merchant-onboarding agent
    agent = await Agent.create({
      name: 'CallKardo Lead Onboarding Partner',
      description: 'Dedicated AI Agent designed to call newly registered merchants, explain CallKardo capabilities, convert the lead, and arrange a demo/meeting with Admin.',
      systemPrompt: `You are an AI Onboarding Specialist calling on behalf of CallKardo (callkardo.com) to welcome a newly registered merchant.
Your core objectives:
1. Warmly congratulate and welcome the merchant partner to CallKardo.
2. Explain how CallKardo transforms their business: 24/7 AI Receptionist, automated outbound customer call campaigns, instant lead qualification, and appointment booking in natural Indian languages (Hindi, English, Hinglish).
3. Inquire about their business and understand their customer call volume.
4. Convert this lead: Politely invite the merchant to an exclusive 15-minute live strategy & setup session with the CallKardo founders/admin team.
5. If the merchant agrees to a meeting: confirm their preferred day and time, and append {{action:schedule_meeting:requested_time}} at the very end of your response (e.g. {{action:schedule_meeting:tomorrow at 3pm}}).
6. If the merchant says they are busy, driving, or asks to call back later: politely acknowledge, ask what time is convenient, and append {{action:request_callback:requested_time}} at the very end of your response (e.g. {{action:request_callback:5pm}} or {{action:request_callback}} if no time is given).
7. Maintain a warm, courteous, professional, and crisp tone (1-2 sentences, under 25 words per turn). Speak Hindi or English naturally based on how the merchant responds.
8. If the merchant says goodbye, thank them warmly and append {{hangup}} at the very end.`,
      firstMessage: 'Namaste! Main CallKardo team se bol rahi hoon. Aapka CallKardo par swagat hai! Kya aapke paas do minute hain baat karne ke liye?',
      language: 'hi',
      voiceId: voice.id,
      adminId: adminId || null,
      userId: null,
      agentType: 'merchant_onboarding',
      isMerchantCaller: true,
      activeStatus: true,
      approvalStatus: 'approved',
      aiProvider: defaults.defaultAiProvider || 'customv2',
      pace: 1.0,
      temperature: 0.6,
    });

    console.log(`[MerchantOnboardingService] Created default Merchant Onboarding Agent: ${agent.id}`);
    return agent;
  }

  /**
   * Trigger automatic onboarding call when a new merchant registers
   * @param {string} merchantId
   */
  async scheduleOnboardingCall(merchantId) {
    try {
      const merchant = await User.findByPk(merchantId);
      if (!merchant || !merchant.mobile) {
        console.warn(`[MerchantOnboardingService] Merchant ${merchantId} not found or has no mobile. Skipping call.`);
        return;
      }

      if (merchant.intrestinourproduct === false) {
        console.log(`[MerchantOnboardingService] Merchant ${merchantId} marked not interested in calls. Skipping.`);
        return;
      }

      const agent = await this.getOrCreateDefaultMerchantAgent();
      const now = new Date();
      let scheduledTime;
      let isNightShift = false;

      if (this.isNightTime(now)) {
        // It's night time! Strictly schedule for 10:00 AM next morning
        scheduledTime = this.adjustIfNight(now);
        isNightShift = true;
      } else {
        // Daytime: schedule with 15 seconds delay so merchant sees signup completion
        scheduledTime = new Date(now.getTime() + 15 * 1000);
      }

      const payload = {
        merchantId: merchant.id,
        agentId: agent.id,
        callType: 'merchant_onboarding',
      };

      await QueueService.scheduleJob('PLACE_MERCHANT_CALL', payload, scheduledTime.getTime());

      const timeLabel = this.formatDateTimeIST(scheduledTime);
      console.log(`[MerchantOnboardingService] Onboarding call scheduled for merchant ${merchant.mobile} at ${timeLabel}${isNightShift ? ' (Night window respected)' : ''}`);

      // Notify Admin
      await NotificationService.notifyAdmin(
        'New Merchant AI Call Scheduled',
        `New merchant ${merchant.businessName || merchant.mobile} registered. AI Onboarding Call scheduled for ${timeLabel}${isNightShift ? ' (adjusted for business hours)' : ''}.`,
        null,
        'call'
      );

      return { scheduledTime, isNightShift };
    } catch (err) {
      console.error(`[MerchantOnboardingService] Failed to schedule onboarding call for merchant ${merchantId}:`, err);
    }
  }

  /**
   * Helper: Parse requested callback or meeting time string into Javascript Date
   * @param {string} timeStr
   * @returns {{ dateObj: Date, displayStr: string }}
   */
  parseRequestedTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') {
      const defaultDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      defaultDate.setHours(11, 0, 0, 0);
      return { dateObj: defaultDate, displayStr: 'Scheduled Time' };
    }

    const lower = timeStr.toLowerCase().trim();
    let targetDate = new Date();

    if (lower.includes('tomorrow') || lower.includes('kal') || lower.includes('agli subah')) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const meridiem = timeMatch[3] ? timeMatch[3].toLowerCase() : null;

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      targetDate.setHours(11, 0, 0, 0);
    }

    // Ensure future timestamp
    if (targetDate.getTime() <= Date.now()) {
      targetDate.setDate(targetDate.getDate() + 1);
    }

    return {
      dateObj: targetDate,
      displayStr: timeStr,
    };
  }

  /**
   * Calculate callback time according to rules:
   * 1. If merchant requested specific time: parse and adjust if night.
   * 2. If NO time mentioned: call 6 hours after call end.
   * 3. If falls in night (21:00 to 09:00 IST), adjust to 10:00 AM next morning!
   * @param {string} [requestedTimeStr]
   * @param {Date} [callEndTime]
   * @returns {{ scheduledTime: Date, isNightAdjusted: boolean }}
   */
  calculateCallbackTime(requestedTimeStr, callEndTime = new Date()) {
    let candidateTime;

    if (requestedTimeStr && requestedTimeStr.trim() !== '') {
      const parsed = this.parseRequestedTime(requestedTimeStr);
      candidateTime = parsed.dateObj;
    } else {
      // 6 hours after call end
      candidateTime = new Date(callEndTime.getTime() + 6 * 60 * 60 * 1000);
    }

    const wasNight = this.isNightTime(candidateTime);
    const scheduledTime = this.adjustIfNight(candidateTime);

    return {
      scheduledTime,
      isNightAdjusted: wasNight,
    };
  }

  /**
   * Handle Callback Request from Merchant
   * @param {string} merchantId
   * @param {string} [requestedTimeStr]
   * @param {string} [callSessionId]
   * @param {string} [agentId]
   */
  async scheduleCallback(merchantId, requestedTimeStr = null, callSessionId = null, agentId = null) {
    try {
      const merchant = await User.findByPk(merchantId);
      if (!merchant) return { success: false, error: 'Merchant not found' };

      const resolvedAgent = agentId ? await Agent.findByPk(agentId) : await this.getOrCreateDefaultMerchantAgent();
      const session = callSessionId ? await CallSession.findByPk(callSessionId) : null;
      const callEndTime = session?.endTime || new Date();

      const { scheduledTime, isNightAdjusted } = this.calculateCallbackTime(requestedTimeStr, callEndTime);
      const timeLabel = this.formatDateTimeIST(scheduledTime);

      // Create Callback Record in Database
      const callback = await MerchantCallback.create({
        merchantId,
        agentId: resolvedAgent ? resolvedAgent.id : null,
        callSessionId: callSessionId || null,
        requestedTime: requestedTimeStr || null,
        scheduledTime,
        status: 'pending',
        notes: isNightAdjusted ? 'Automatically shifted to next morning 10:00 AM IST due to night restriction' : null,
      });

      // Schedule in Redis Sorted Set
      await QueueService.scheduleJob(
        'MERCHANT_CALLBACK',
        {
          callbackId: callback.id,
          merchantId,
          agentId: resolvedAgent ? resolvedAgent.id : null,
        },
        scheduledTime.getTime()
      );

      console.log(`[MerchantOnboardingService] Callback record ${callback.id} scheduled for merchant ${merchant.mobile} at ${timeLabel}`);

      // Notify Admin
      await NotificationService.notifyAdmin(
        'Merchant Callback Scheduled',
        `Merchant ${merchant.businessName || merchant.mobile} requested a callback. Scheduled for ${timeLabel}${isNightAdjusted ? ' (adjusted for night restriction)' : ''}.`,
        null,
        'call'
      );

      return {
        success: true,
        callbackId: callback.id,
        scheduledTime: timeLabel,
        isNightAdjusted,
      };
    } catch (err) {
      console.error('[MerchantOnboardingService] Error scheduling callback:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Handle Meeting Scheduling from AI Call
   * @param {string} merchantId
   * @param {string} meetingTimeStr
   * @param {string} [callSessionId]
   * @param {string} [agentId]
   */
  async scheduleMeeting(merchantId, meetingTimeStr, callSessionId = null, agentId = null) {
    try {
      const merchant = await User.findByPk(merchantId);
      if (!merchant) return { success: false, error: 'Merchant not found' };

      const parsedTime = this.parseRequestedTime(meetingTimeStr);
      const meetingDate = parsedTime.dateObj;
      const timeLabel = this.formatDateTimeIST(meetingDate);

      // Generate dynamic Jitsi meeting link
      const roomId = 'CallKardo-Meet-' + Math.random().toString(36).substring(2, 8);
      const meetingLink = process.env.DEFAULT_MEETING_LINK || `https://meet.jit.si/${roomId}`;

      // Calculate 15-minute reminder time
      const reminderTime = new Date(meetingDate.getTime() - 15 * 60 * 1000);

      // Create Meeting record in DB
      const meeting = await Meeting.create({
        merchantId,
        agentId: agentId || null,
        callSessionId: callSessionId || null,
        title: `Merchant Demo & Strategy Meeting with ${merchant.businessName || merchant.mobile}`,
        description: `Lead conversion demo meeting booked by AI Agent for merchant ${merchant.businessName || merchant.mobile} (${merchant.mobile}).`,
        meetingTime: meetingDate,
        meetingLink,
        status: 'scheduled',
        reminderCallTime: reminderTime,
        reminderCallStatus: 'pending',
      });

      // Schedule 15-minute reminder in Redis Sorted Set
      if (reminderTime.getTime() > Date.now()) {
        await QueueService.scheduleJob(
          'MEETING_REMINDER',
          {
            meetingId: meeting.id,
            merchantId,
          },
          reminderTime.getTime()
        );
        console.log(`[MerchantOnboardingService] 15-min reminder call queued for ${this.formatDateTimeIST(reminderTime)}`);
      }

      // Generate iCal Calendar Invite
      const ActionService = require('./actionService');
      const icalEvent = ActionService._generateIcalInvite({
        summary: `CallKardo Strategy Meeting - ${merchant.businessName || merchant.mobile}`,
        description: `Hi ${merchant.businessName || 'Merchant Partner'},\n\nYour meeting with CallKardo is scheduled for ${timeLabel}.\nJoin link: ${meetingLink}\n\nBest regards,\nCallKardo Team`,
        location: meetingLink,
        startTime: meetingDate,
        organizerEmail: defaults.smtp.from,
      });

      // Send Email to Merchant and CC Admin
      const merchantEmail = merchant.email;
      const adminEmail = defaults.smtp.from;

      if (merchantEmail) {
        await sendEmail({
          to: merchantEmail,
          cc: adminEmail,
          subject: `Meeting Confirmed: CallKardo Strategy Session (${timeLabel})`,
          text: `Hi ${merchant.businessName || 'Partner'},\n\nYour meeting has been scheduled for ${timeLabel}.\nMeeting Link: ${meetingLink}\n\nOur team looks forward to connecting with you.`,
          icalEvent,
        }).catch(err => console.warn('[MerchantOnboardingService] Email sending failed:', err.message));
      } else {
        await sendEmail({
          to: adminEmail,
          subject: `[CallKardo Alert] Meeting Booked with Merchant ${merchant.businessName || merchant.mobile}`,
          text: `A new meeting was booked for ${timeLabel} with merchant ${merchant.businessName || merchant.mobile} (${merchant.mobile}).\nMeeting Link: ${meetingLink}`,
          icalEvent,
        }).catch(err => console.warn('[MerchantOnboardingService] Admin notification email failed:', err.message));
      }

      // Notify Admin in DB / Push
      await NotificationService.notifyAdmin(
        'Lead Converted! Meeting Scheduled',
        `Merchant ${merchant.businessName || merchant.mobile} scheduled a meeting for ${timeLabel}. Meeting Link: ${meetingLink}. 15-min reminder call is scheduled.`,
        null,
        'meeting'
      );

      return {
        success: true,
        meetingId: meeting.id,
        meetingLink,
        scheduledTime: timeLabel,
      };
    } catch (err) {
      console.error('[MerchantOnboardingService] Error scheduling meeting:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Execute 15-Minute Meeting Reminder Call
   * @param {string} meetingId
   */
  async triggerMeetingReminder(meetingId) {
    try {
      const meeting = await Meeting.findByPk(meetingId, {
        include: [{ model: User, as: 'merchant' }],
      });

      if (!meeting) {
        console.warn(`[MerchantOnboardingService] Meeting ${meetingId} not found. Skipping reminder.`);
        return;
      }

      if (meeting.status !== 'scheduled') {
        console.log(`[MerchantOnboardingService] Meeting ${meetingId} status is ${meeting.status}. Skipping reminder call.`);
        return;
      }

      if (meeting.reminderCallStatus === 'completed' || meeting.reminderCallStatus === 'initiated') {
        console.log(`[MerchantOnboardingService] Reminder for meeting ${meetingId} already executed.`);
        return;
      }

      const merchant = meeting.merchant;
      if (!merchant || !merchant.mobile) {
        console.warn(`[MerchantOnboardingService] No merchant mobile for meeting ${meetingId}.`);
        return;
      }

      const agent = await this.getOrCreateDefaultMerchantAgent();

      // Enqueue Outbound Reminder Call
      await QueueService.enqueueJob('PLACE_MERCHANT_CALL', {
        merchantId: merchant.id,
        agentId: agent.id,
        callType: 'meeting_reminder',
        meetingId: meeting.id,
      });

      meeting.reminderCallStatus = 'initiated';
      await meeting.save();

      const timeLabel = this.formatDateTimeIST(meeting.meetingTime);
      console.log(`[MerchantOnboardingService] 15-Minute reminder call dispatched to merchant ${merchant.mobile} for meeting at ${timeLabel}`);

      // Notify Admin
      await NotificationService.notifyAdmin(
        '15-Min Meeting Reminder Call Dispatched',
        `AI Reminder call placed to Merchant ${merchant.businessName || merchant.mobile} for upcoming meeting at ${timeLabel}.`,
        null,
        'meeting'
      );

      // Also send Push Notification to Merchant if FCM token exists
      await NotificationService.notifyMerchant(
        merchant.id,
        'Meeting Starting in 15 Minutes!',
        `Your meeting with CallKardo is starting at ${timeLabel}. Join link: ${meeting.meetingLink}`,
        'meeting'
      );

      return { success: true };
    } catch (err) {
      console.error('[MerchantOnboardingService] Error triggering meeting reminder:', err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new MerchantOnboardingService();
