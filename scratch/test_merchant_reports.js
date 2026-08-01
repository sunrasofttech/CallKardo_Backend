const { CallSession, User, Customer, Campaign, sequelize } = require('../src/models');
const reportController = require('../src/controllers/reportController');

async function run() {
  try {
    // Find a merchant with some actions
    const session = await CallSession.findOne({
      where: sequelize.literal("JSON_LENGTH(actions) > 0")
    });

    if (!session) {
      console.log('No sessions with actions found, skipping test.');
      process.exit(0);
    }

    const req = {
      user: { id: session.userId },
      query: {
        page: 1,
        limit: 10
      }
    };
    
    const res = {
      status: (code) => {
        console.log('Status:', code);
        return res;
      },
      json: (data) => {
        console.log('Response Items Count:', data.data.actions.length);
        if (data.data.actions.length > 0) {
            console.log('First Action:', JSON.stringify(data.data.actions[0], null, 2));
        }
      }
    };

    const next = (err) => {
      console.error('Error in next():', err);
    };

    console.log('Testing getCalendarActionsReport...');
    await reportController.getCalendarActionsReport(req, res, next);

    console.log('Testing getUserActionsReport...');
    await reportController.getUserActionsReport(req, res, next);

  } catch (err) {
    console.error('Script Error:', err);
  } finally {
    process.exit(0);
  }
}

run();
