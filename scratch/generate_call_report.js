const { CallSession, User, Customer, Agent } = require('../src/models');
const sequelize = require('../src/config/database');

async function generateReport() {
  try {
    await sequelize.authenticate();
    
    const totalCalls = await CallSession.count();
    const inboundCalls = await CallSession.count({ where: { direction: 'inbound' } });
    const outboundCalls = await CallSession.count({ where: { direction: 'outbound' } });
    
    const statusCounts = await CallSession.findAll({
      attributes: ['status', [sequelize.fn('count', sequelize.col('status')), 'count']],
      group: ['status'],
      raw: true
    });

    const recentCalls = await CallSession.findAll({
      limit: 10,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'user', attributes: ['email'] },
        { model: Customer, as: 'customer', attributes: ['mobile', 'name'] },
        { model: Agent, as: 'agent', attributes: ['name', 'aiProvider'] }
      ]
    });

    console.log('==================================================');
    console.log('               CALL SYSTEM REPORT                 ');
    console.log('==================================================');
    console.log(`Total Call Sessions:   ${totalCalls}`);
    console.log(`Inbound Calls:         ${inboundCalls}`);
    console.log(`Outbound Calls:        ${outboundCalls}`);
    console.log('Status Breakdown:');
    statusCounts.forEach(s => {
      console.log(`  - ${s.status.padEnd(15)}: ${s.count}`);
    });
    console.log('==================================================');
    console.log('\nLast 10 Call Sessions:');
    
    recentCalls.forEach((call, index) => {
      let duration = 'N/A';
      if (call.startTime && call.endTime) {
        duration = `${Math.round((new Date(call.endTime) - new Date(call.startTime)) / 1000)}s`;
      }
      
      console.log(`\n[${index + 1}] Session ID: ${call.id}`);
      console.log(`    Created:     ${call.createdAt}`);
      console.log(`    Merchant:    ${call.user ? call.user.email : 'N/A'}`);
      console.log(`    Customer:    ${call.customer ? `${call.customer.name} (${call.customer.mobile})` : 'N/A'}`);
      console.log(`    Agent:       ${call.agent ? `${call.agent.name} [${call.agent.aiProvider}]` : 'N/A'}`);
      console.log(`    Direction:   ${call.direction.toUpperCase()}`);
      console.log(`    Status:      ${call.status.toUpperCase()}`);
      console.log(`    Duration:    ${duration}`);
      console.log(`    Transcript:  ${call.transcript ? `"${call.transcript.substring(0, 100).replace(/\n/g, ' ')}..."` : '(Empty)'}`);
    });
    console.log('\n==================================================');
    process.exit(0);
  } catch (err) {
    console.error('Error generating report:', err);
    process.exit(1);
  }
}

generateReport();
