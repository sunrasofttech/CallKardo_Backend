const { CallForwarding, VobizNumber, Agent, CallSession } = require('../models');
const ResponseBuilder = require('../utils/response');
const { normalizeMobile } = require('../utils/phone');
const { createForwardingSchema, updateForwardingSchema } = require('../validators/callForwarding');

/**
 * GSM forwarding (MMI) codes the merchant dials on their own phone.
 * Codes are standard on Indian GSM networks, but a few operators differ,
 * so they are returned as guidance alongside the setup.
 */
function buildForwardingCodes(vobizNumber) {
  const target = String(vobizNumber || '').replace(/\s/g, '');
  // '#' must be percent-encoded for the dialer to accept a tel: link
  const dialUri = (code) => `tel:${code.replace(/#/g, '%23')}`;
  const entry = (activate, deactivate, label) => ({
    activate,
    deactivate,
    label,
    activateDialUri: dialUri(activate),
    deactivateDialUri: dialUri(deactivate),
  });

  return {
    all: entry(`**21*${target}#`, '##21#', 'Forward all calls'),
    busy: entry(`**67*${target}#`, '##67#', 'Forward when busy'),
    unanswered: entry(`**61*${target}#`, '##61#', 'Forward when unanswered'),
    unreachable: entry(`**62*${target}#`, '##62#', 'Forward when unreachable'),
    deactivateAll: '##002#',
    deactivateAllDialUri: dialUri('##002#'),
    note: 'Dial these codes from the phone whose calls should be forwarded. The app can open the dialer with the dial URI (Android runs MMI codes this way; on iOS the merchant may have to dial manually). Codes can differ by operator.',
  };
}

class CallForwardingController {
  /**
   * Connect a personal number to a VoBiz number and pick the agent that answers forwarded calls
   */
  async create(req, res, next) {
    try {
      const { error, value } = createForwardingSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const { vobizNumberId, agentId, personalNumber, forwardingType, notes } = value;

      const vobizNumber = await VobizNumber.findOne({ where: { id: vobizNumberId, userId: req.user.id } });
      if (!vobizNumber) {
        return ResponseBuilder.error(res, 'VoBiz number not found', 404);
      }
      if (vobizNumber.status !== 'active') {
        return ResponseBuilder.error(res, 'This VoBiz number is not active', 400);
      }

      const agent = await Agent.findOne({ where: { id: agentId, userId: req.user.id } });
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found. Create an agent for call forwarding first.', 404);
      }

      const existing = await CallForwarding.findOne({ where: { vobizNumberId } });
      if (existing) {
        return ResponseBuilder.error(res, 'This VoBiz number is already connected to a forwarding setup', 409);
      }

      const forwarding = await CallForwarding.create({
        userId: req.user.id,
        vobizNumberId,
        agentId,
        personalNumber: normalizeMobile(personalNumber),
        forwardingType: forwardingType || 'all',
        notes,
      });

      // Mark the agent as a call-forwarding agent so it is managed separately from campaign agents
      if (agent.agentType !== 'call_forwarding') {
        await agent.update({ agentType: 'call_forwarding' });
      }

      // Make sure the number actually delivers inbound calls to us (routing can be missing
      // if it failed when the number was bought), otherwise forwarded calls never arrive.
      let routingReady = true;
      try {
        const vobizService = require('../services/vobizService');
        const routing = await vobizService.ensureInboundRouting(req.user.id, vobizNumber.number);
        routingReady = !routing || routing.success !== false;
      } catch (routingErr) {
        routingReady = false;
        console.error(`[CallForwarding] Inbound routing setup failed for ${vobizNumber.number}:`, routingErr.message);
      }

      return ResponseBuilder.success(res, {
        forwarding,
        vobizNumber: vobizNumber.number,
        routingReady,
        forwardingCodes: buildForwardingCodes(vobizNumber.number),
      }, routingReady
        ? 'Call forwarding connected. Dial the activation code on your phone to start forwarding.'
        : 'Call forwarding saved, but this number could not be configured to receive calls. Contact support before forwarding to it.', 201);
    } catch (err) {
      next(err);
    }
  }

  /**
   * List the merchant's call forwarding setups
   */
  async getAll(req, res, next) {
    try {
      const forwardings = await CallForwarding.findAll({
        where: { userId: req.user.id },
        include: [
          { model: VobizNumber, as: 'vobizNumber', attributes: ['id', 'number', 'status'] },
          { model: Agent, as: 'agent', attributes: ['id', 'name', 'agentType', 'activeStatus', 'language'] },
        ],
        order: [['createdAt', 'DESC']],
      });

      const data = forwardings.map((f) => ({
        ...f.toJSON(),
        forwardingCodes: buildForwardingCodes(f.vobizNumber?.number),
      }));

      return ResponseBuilder.success(res, data, 'Call forwarding setups retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get one setup, with how many calls it has answered
   */
  async getById(req, res, next) {
    try {
      const forwarding = await CallForwarding.findOne({
        where: { id: req.params.id, userId: req.user.id },
        include: [
          { model: VobizNumber, as: 'vobizNumber', attributes: ['id', 'number', 'status'] },
          { model: Agent, as: 'agent' },
        ],
      });

      if (!forwarding) {
        return ResponseBuilder.error(res, 'Call forwarding setup not found', 404);
      }

      const totalCalls = await CallSession.count({
        where: { userId: req.user.id, vobizNumberId: forwarding.vobizNumberId, callType: 'call_forwarding' },
      });

      return ResponseBuilder.success(res, {
        ...forwarding.toJSON(),
        totalCalls,
        forwardingCodes: buildForwardingCodes(forwarding.vobizNumber?.number),
      }, 'Call forwarding setup retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Change the answering agent, the personal number, the type or the status
   */
  async update(req, res, next) {
    try {
      const { error, value } = updateForwardingSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }

      const forwarding = await CallForwarding.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!forwarding) {
        return ResponseBuilder.error(res, 'Call forwarding setup not found', 404);
      }

      if (value.agentId) {
        const agent = await Agent.findOne({ where: { id: value.agentId, userId: req.user.id } });
        if (!agent) {
          return ResponseBuilder.error(res, 'Agent not found', 404);
        }
        if (agent.agentType !== 'call_forwarding') {
          await agent.update({ agentType: 'call_forwarding' });
        }
      }

      if (value.personalNumber) {
        value.personalNumber = normalizeMobile(value.personalNumber);
      }

      await forwarding.update(value);

      return ResponseBuilder.success(res, forwarding, 'Call forwarding setup updated');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Disconnect a forwarding setup (the merchant must also cancel forwarding on their phone)
   */
  async delete(req, res, next) {
    try {
      const forwarding = await CallForwarding.findOne({
        where: { id: req.params.id, userId: req.user.id },
        include: [{ model: VobizNumber, as: 'vobizNumber', attributes: ['number'] }],
      });

      if (!forwarding) {
        return ResponseBuilder.error(res, 'Call forwarding setup not found', 404);
      }

      const codes = buildForwardingCodes(forwarding.vobizNumber?.number);
      await forwarding.destroy();

      return ResponseBuilder.success(res, {
        deactivationCode: codes[forwarding.forwardingType]?.deactivate || codes.deactivateAll,
      }, 'Call forwarding disconnected. Dial the deactivation code on your phone to stop forwarding.');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new CallForwardingController();
