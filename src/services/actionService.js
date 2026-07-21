const defaults = require('../config/defaults');
const { sendEmail } = require('../utils/email');

class ActionService {
  /**
   * Handle Join Link action
   */
  async sendJoinLink(customer, agent, merchant) {
    const mobile = customer?.mobile || 'Unknown';
    const name = customer?.name || 'Customer';
    const customerEmail = customer?.email;
    const merchantEmail = merchant?.email || defaults.smtp.from || 'alerts@callkardo.com';
    const joinLink = defaults.defaultJoinLink || 'https://meet.callkardo.com/join/session-xyz';
    
    if (customerEmail) {
      console.log(`[Action: send_join_link] Sending join link to customer ${name} (${customerEmail}), CC: ${merchantEmail}`);
      
      await sendEmail({
        to: customerEmail,
        cc: merchantEmail,
        subject: `Join Link - ${agent?.name || 'AI Agent'}`,
        text: `Hi ${name},\n\nHere is your link to join the session:\n\n${joinLink}\n\nBest regards,\n${agent?.name || 'AI Agent'}`,
      });
    } else {
      console.log(`[Action: send_join_link] No customer email. Sending join link directly to merchant at ${merchantEmail}`);
      
      await sendEmail({
        to: merchantEmail,
        subject: `[CallKardo Alert] Join Link requested by customer ${name}`,
        text: `Customer ${name} (${mobile}) requested a join link during their call with Agent "${agent?.name || 'AI Agent'}".\n\nLink: ${joinLink}\n\n(This email was sent to you because the customer did not have a registered email address.)`,
      });
    }
    
    return { success: true };
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
    const merchantEmail = merchant?.email || defaults.smtp.from || 'alerts@callkardo.com';
    
    // Use configured meeting link or default link
    const meetingLink = process.env.DEFAULT_MEETING_LINK || defaults.defaultMeetingLink;
    
    if (customerEmail) {
      console.log(`[Action: schedule_meeting] Scheduling meeting for ${name}. Link: ${meetingLink}. Target: ${customerEmail}, CC: ${merchantEmail}`);
      
      // Send email to customer, CC merchant
      await sendEmail({
        to: customerEmail,
        cc: merchantEmail,
        subject: `Scheduled Meeting Invitation - ${agent?.name || 'AI Agent'}`,
        text: `Hi ${name},\n\nYour meeting has been successfully scheduled. You can join the Google Meet here:\n\n${meetingLink}\n\nBest regards,\n${agent?.name || 'AI Agent'}`,
      });
    } else {
      console.log(`[Action: schedule_meeting] No customer email. Sending meeting link directly to merchant at ${merchantEmail}`);
      
      // Send directly to merchant ONLY
      await sendEmail({
        to: merchantEmail,
        subject: `[CallKardo Alert] Meeting Scheduled with ${name}`,
        text: `A meeting was scheduled during a call with ${name} (${mobile}) by Agent "${agent?.name || 'AI Agent'}".\n\nGoogle Meet Link: ${meetingLink}\n\n(This email was sent to you because the customer did not have a registered email address.)`,
      });
    }
    
    return { success: true, meetingLink };
  }
}

module.exports = new ActionService();
