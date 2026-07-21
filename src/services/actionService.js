const defaults = require('../config/defaults');
const { sendEmail } = require('../utils/email');

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
   * Handle Join Link action
   */
  async sendJoinLink(customer, agent, merchant) {
    const mobile = customer?.mobile || 'Unknown';
    const name = customer?.name || 'Customer';
    const customerEmail = customer?.email;
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
    const customerEmail = customer?.email;
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
   * Handle Schedule Meeting action
   */
  async scheduleMeeting(customer, agent, merchant) {
    const name = customer?.name || 'Customer';
    const mobile = customer?.mobile || 'Unknown';
    const customerEmail = customer?.email;
    const merchantEmail = merchant?.email || defaults.smtp.from;

    // Generate dynamic unique Jitsi Meet room link unless overridden by env
    const roomId = 'CallKardo-Meet-' + Math.random().toString(36).substring(2, 8);
    const meetingLink = process.env.DEFAULT_MEETING_LINK || `https://meet.jit.si/${roomId}`;

    const summary = `Scheduled Meeting - ${agent?.name || 'AI Receptionist'}`;
    const description = `Hi ${name},\n\nYour meeting has been successfully scheduled. You can join the meeting room here:\n\n${meetingLink}\n\nBest regards,\n${agent?.name || 'AI Receptionist'}`;

    const icalEvent = this._generateIcalInvite({
      summary,
      description,
      location: meetingLink,
      organizerEmail: merchantEmail
    });

    if (customerEmail) {
      console.log(`[Action: schedule_meeting] Scheduling meeting for ${name}. Link: ${meetingLink}. Target: ${customerEmail}, CC: ${merchantEmail}`);

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
        subject: `[CallKardo Alert] Meeting Scheduled with ${name}`,
        text: `A meeting was scheduled during a call with ${name} (${mobile}) by Agent "${agent?.name || 'AI Agent'}".\n\nMeeting Link: ${meetingLink}\n\n(This email was sent to you because the customer did not have a registered email address.)`,
        icalEvent,
      });
    }

    return { success: true, meetingLink };
  }
}

module.exports = new ActionService();
