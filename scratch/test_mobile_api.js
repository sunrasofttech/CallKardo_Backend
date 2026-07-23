require('dotenv').config();
const { Customer, CallReport, CallSession, Campaign, VobizNumber, sequelize } = require('../src/models');
const { Op } = require('sequelize');

async function testMobileApiLogic() {
  try {
    await sequelize.authenticate();
    const userId = '998e3036-1683-44f8-adc4-d2aea8b0e271';
    const mobile = '9561868381';

    console.log(`--- TESTING ENHANCED GET REPORTS BY MOBILE FOR '${mobile}' ---`);

    const digitsOnly = mobile.replace(/[^0-9]/g, '');
    const searchPattern = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;

    const customers = await Customer.findAll({
      where: {
        [Op.and]: [
          { userId },
          {
            [Op.or]: [
              { mobile },
              { mobile: { [Op.like]: `%${searchPattern}%` } }
            ]
          }
        ]
      }
    });

    const customerIds = customers.map(c => c.id);
    console.log(`Matched Customer IDs for user ${userId}:`, customerIds);

    let reports = await CallReport.findAll({
      where: {
        userId,
        customerId: { [Op.in]: customerIds }
      },
      include: [
        { model: Customer, as: 'customer', attributes: ['name', 'mobile', 'tags', 'notes'] },
        { model: Campaign, as: 'campaign', attributes: ['name', 'startTime'] },
        { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    console.log(`CallReports count: ${reports.length}`);

    if (reports.length === 0 && customerIds.length > 0) {
      console.log('No CallReports found. Falling back to CallSessions...');
      const sessions = await CallSession.findAll({
        where: {
          userId,
          customerId: { [Op.in]: customerIds }
        },
        include: [
          { model: Customer, as: 'customer', attributes: ['name', 'mobile', 'tags', 'notes'] },
          { model: Campaign, as: 'campaign', attributes: ['name', 'startTime'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['number'] },
        ],
        order: [['createdAt', 'DESC']],
      });

      console.log(`Found ${sessions.length} CallSessions! Constructing report objects...`);

      reports = sessions.map(s => ({
        id: s.id,
        userId: s.userId,
        callSessionId: s.id,
        customerId: s.customerId,
        campaignId: s.campaignId,
        transcript: [],
        summary: `Call ${s.direction} (${s.status})`,
        sentiment: 'neutral',
        outcome: s.status === 'completed' ? 'connected' : (s.status === 'busy' ? 'busy' : 'failed'),
        callDurationSeconds: (s.startTime && s.endTime) ? Math.round((new Date(s.endTime) - new Date(s.startTime)) / 1000) : 0,
        customer: s.customer,
        campaign: s.campaign,
        vobizNumber: s.vobizNumber,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
    }

    console.log(`\nFinal API Response Data Array Length: ${reports.length}`);
    console.log(JSON.stringify(reports, null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await sequelize.close();
  }
}

testMobileApiLogic();
