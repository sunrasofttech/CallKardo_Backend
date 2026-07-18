const defaults = require('../config/defaults');
const { sendEmail } = require('../utils/email');

class ActionService {
  /**
   * Handle Join Link action
   */
  async sendJoinLink(customer, agent) {
    const mobile = customer?.mobile || 'Unknown';
    const name = customer?.name || 'Customer';
    const joinLink = 'https://meet.callkardo.com/join/session-xyz';
    
    console.log(`[Action: send_join_link] Sending join link ${joinLink} to ${name} (${mobile})`);
    
    // Send a notification email to the merchant
    await sendEmail({
      to: defaults.smtp.from || 'alerts@callkardo.com',
      subject: `[CallKardo Alert] Join Link Requested by ${name}`,
      text: `Customer ${name} (${mobile}) requested a join link during their call with Agent "${agent?.name || 'AI Agent'}".\n\nLink sent: ${joinLink}`,
    });
    
    return { success: true, message: 'Join link sent' };
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
  async sendCustomerEmail(customer, agent, subjectText, bodyText) {
    const name = customer?.name || 'Customer';
    const simulatedEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;
    
    console.log(`[Action: send_email] Sending email to ${name} at ${simulatedEmail}`);
    
    await sendEmail({
      to: simulatedEmail,
      subject: subjectText || `Information from ${agent?.name || 'AI Agent'}`,
      text: bodyText || `Hi ${name},\n\nHere are the details we discussed during our call.\n\nBest regards,\n${agent?.name || 'AI Agent'}`,
    });
    
    return { success: true, message: `Email sent to ${simulatedEmail}` };
  }

  /**
   * Handle Schedule Meeting action
   */
  async scheduleMeeting(customer, agent) {
    const name = customer?.name || 'Customer';
    const mobile = customer?.mobile || 'Unknown';
    
    // Generate a random meeting code (e.g. abc-defg-hij)
    const generateMeetingCode = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      const part1 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const part2 = Array.from({length: 4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      const part3 = Array.from({length: 3}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      return `${part1}-${part2}-${part3}`;
    };
    
    const meetingCode = generateMeetingCode();
    const meetingLink = `https://meet.google.com/${meetingCode}`;
    const simulatedEmail = `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;
    
    console.log(`[Action: schedule_meeting] Scheduling meeting for ${name}. Link: ${meetingLink}`);
    
    // Send email to simulated customer email
    await sendEmail({
      to: simulatedEmail,
      subject: `Scheduled Meeting Invitation - ${agent?.name || 'AI Agent'}`,
      text: `Hi ${name},\n\nYour meeting has been successfully scheduled. You can join the Google Meet here:\n\n${meetingLink}\n\nBest regards,\n${agent?.name || 'AI Agent'}`,
    });
    
    // Send notification email to merchant
    await sendEmail({
      to: defaults.smtp.from || 'alerts@callkardo.com',
      subject: `[CallKardo Alert] Meeting Scheduled with ${name}`,
      text: `A meeting was scheduled during a call with ${name} (${mobile}) by Agent "${agent?.name || 'AI Agent'}".\n\nGoogle Meet Link: ${meetingLink}\nInvitation sent to: ${simulatedEmail}`,
    });
    
    return { success: true, meetingLink };
  }
}

module.exports = new ActionService();
