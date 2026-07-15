const { VobizNumber } = require('../models');
const defaults = require('../config/defaults');

async function removeTrialDemoNumber(userId, options = {}) {
  return VobizNumber.destroy({
    where: {
      userId,
      number: defaults.vobiz.demoNumber,
    },
    ...options,
  });
}

module.exports = { removeTrialDemoNumber };
