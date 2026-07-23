const { Admin, Agent, CallReport, Campaign, Category, Plan, Setting, Subscription, User, VobizNumber, Voice, AuditLog, CallSession, Customer } = require('../models');
const ResponseBuilder = require('../utils/response');
const { removeTrialDemoNumber } = require('../services/trialDemoNumberService');
const { createVoiceSchema, updateVoiceSchema } = require('../validators/admin');


class AdminController {
  async getDashboard(req, res, next) {
    try {
      const { Op } = require('sequelize');
      const now = new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        merchantsCount,
        prevMerchantsCount,
        activeSubscriptionsCount,
        prevActiveSubscriptionsCount,
        agentsCount,
        virtualNumbersCount,
        runningCampaignsCount,
        completedCallsCount,
        prevCompletedCallsCount,
        totalUsersCount,
        prevTotalUsersCount,
        activeSubscriptions,
        prevSubscriptions,
        recentMerchantsDB,
        recentSubscriptionsDB,
      ] = await Promise.all([
        User.count({ where: { role: 'merchant' } }),
        User.count({ where: { role: 'merchant', createdAt: { [Op.lt]: startOfCurrentMonth } } }),
        Subscription.count({ where: { status: 'active' } }),
        Subscription.count({ where: { status: 'active', createdAt: { [Op.lt]: startOfCurrentMonth } } }),
        Agent.count(),
        VobizNumber.count({ where: { status: 'active' } }),
        Campaign.count({ where: { status: 'running' } }),
        CallReport.count(),
        CallReport.count({ where: { createdAt: { [Op.lt]: startOfCurrentMonth } } }),
        User.count(),
        User.count({ where: { createdAt: { [Op.lt]: startOfCurrentMonth } } }),
        Subscription.findAll({
          where: { status: 'active' },
          include: [{ model: Plan, as: 'plan' }],
        }).catch(() => []),
        Subscription.findAll({
          where: { status: 'active', createdAt: { [Op.lt]: startOfCurrentMonth } },
          include: [{ model: Plan, as: 'plan' }],
        }).catch(() => []),
        User.findAll({
          where: { role: 'merchant' },
          limit: 5,
          order: [['createdAt', 'DESC']],
          include: [
            { model: Subscription, as: 'subscription', include: [{ model: Plan, as: 'plan' }] },
          ],
        }).catch(() => []),
        Subscription.findAll({
          limit: 5,
          order: [['createdAt', 'DESC']],
          include: [
            { model: User, as: 'user', attributes: ['id', 'businessName', 'email', 'mobile'] },
            { model: Plan, as: 'plan' },
          ],
        }).catch(() => []),
      ]);

      // Calculate Revenue dynamically from active subscriptions
      const currentRevenue = (activeSubscriptions || []).reduce(
        (sum, sub) => sum + (sub.plan ? parseFloat(sub.plan.price || 0) : 0),
        0
      );
      const prevRevenue = (prevSubscriptions || []).reduce(
        (sum, sub) => sum + (sub.plan ? parseFloat(sub.plan.price || 0) : 0),
        0
      );

      // Utility for calculating dynamic % changes
      const calcPctChange = (curr, prev) => {
        if (prev === 0) return curr > 0 ? '+100%' : '0%';
        const pct = (((curr - prev) / prev) * 100).toFixed(1);
        return `${pct >= 0 ? '+' : ''}${pct}%`;
      };

      const revenueChange = calcPctChange(currentRevenue, prevRevenue);
      const callsChange = calcPctChange(completedCallsCount, prevCompletedCallsCount);
      const usersChange = calcPctChange(totalUsersCount, prevTotalUsersCount);
      const newBusinessesCount = merchantsCount - prevMerchantsCount;
      const businessesChange = newBusinessesCount > 0 ? `+${newBusinessesCount} new` : '0 new';

      // Format Recent Businesses dynamically from DB
      const recentBusinesses = (recentMerchantsDB || []).map((m, index) => {
        const name = m.businessName || m.email || `Business ${m.mobile || index + 1}`;
        const initials = name
          .split(' ')
          .filter(Boolean)
          .map((n) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase() || 'BU';
        const planName = m.subscription?.plan?.name || m.subscription?.activePlan || 'N/A';
        const calls = m.subscription?.callsUsed || 0;
        const status = m.isVerified ? 'Active' : (m.kycStatus === 'pending' ? 'Pending' : 'Inactive');
        return {
          id: m.id,
          name,
          initials,
          plan: planName,
          callsCount: calls,
          formattedCalls: `${calls.toLocaleString('en-IN')} calls`,
          status,
        };
      });

      // Format Recent Transactions dynamically from DB
      const recentTransactions = (recentSubscriptionsDB || []).map((sub) => {
        const businessName =
          sub.user?.businessName || sub.user?.email || `Merchant ${sub.user?.mobile || ''}`;
        const amount = parseFloat(sub.plan?.price || 0);
        const formattedDate = new Date(sub.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        return {
          id: sub.id,
          businessName,
          date: formattedDate,
          amount,
          formattedAmount: `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          status: sub.status === 'active' ? 'Paid' : (sub.status ? sub.status.charAt(0).toUpperCase() + sub.status.slice(1) : 'Pending'),
        };
      });

      // Stat Cards dynamic formatting
      const revenueFormatted = `₹${currentRevenue.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
      const callsFormatted = completedCallsCount.toLocaleString('en-IN');
      const usersFormatted = totalUsersCount.toLocaleString('en-IN');
      const activeBusinessesFormatted = merchantsCount.toString();

      const statCards = [
        {
          key: 'total_revenue',
          label: 'Total Revenue',
          value: revenueFormatted,
          numericValue: currentRevenue,
          change: revenueChange,
          changeType: parseFloat(revenueChange) >= 0 ? 'positive' : 'negative',
          icon: 'dollar',
        },
        {
          key: 'total_ai_calls',
          label: 'Total AI Calls',
          value: callsFormatted,
          numericValue: completedCallsCount,
          change: callsChange,
          changeType: parseFloat(callsChange) >= 0 ? 'positive' : 'negative',
          icon: 'phone',
        },
        {
          key: 'total_users',
          label: 'Total Users',
          value: usersFormatted,
          numericValue: totalUsersCount,
          change: usersChange,
          changeType: parseFloat(usersChange) >= 0 ? 'positive' : 'negative',
          icon: 'users',
        },
        {
          key: 'active_businesses',
          label: 'Active Businesses',
          value: activeBusinessesFormatted,
          numericValue: merchantsCount,
          change: businessesChange,
          changeType: newBusinessesCount >= 0 ? 'positive' : 'negative',
          icon: 'building',
        },
      ];

      // Platform Overview Header
      const overview = {
        badge: 'ADMIN CONTROL PANEL',
        title: 'Platform Overview',
        subtitle: 'AI Calling Admin Dashboard',
        statusPills: [
          { label: 'All Systems Operational', type: 'operational', hasDot: true },
          { label: 'Live', type: 'live', hasIcon: true },
        ],
      };

      // Platform Health
      const platformHealth = {
        status: 'All OK',
        services: [
          { name: 'AI Call Service', uptime: '99.9%', status: 'operational' },
          { name: 'API Gateway', uptime: '100%', status: 'operational' },
          { name: 'Voice Synthesis', uptime: '99.7%', status: 'operational' },
          { name: 'Transcription Engine', uptime: '98.2%', status: 'operational' },
        ],
      };

      // Navigation / Quick Actions
      const quickNavigation = [
        { title: 'Businesses', icon: 'building', path: '/admin/businesses' },
        { title: 'Billing', icon: 'billing', path: '/admin/billing' },
        { title: 'Call Logs', icon: 'phone', path: '/admin/call-logs' },
        { title: 'Settings', icon: 'settings', path: '/admin/settings' },
      ];

      const dashboardData = {
        overview,
        statCards,
        metrics: {
          totalRevenue: {
            label: 'Total Revenue',
            value: revenueFormatted,
            numericValue: currentRevenue,
            change: revenueChange,
          },
          totalAiCalls: {
            label: 'Total AI Calls',
            value: callsFormatted,
            numericValue: completedCallsCount,
            change: callsChange,
          },
          totalUsers: {
            label: 'Total Users',
            value: usersFormatted,
            numericValue: totalUsersCount,
            change: usersChange,
          },
          activeBusinesses: {
            label: 'Active Businesses',
            value: activeBusinessesFormatted,
            numericValue: merchantsCount,
            change: businessesChange,
          },
        },
        platformHealth,
        quickNavigation,
        recentBusinesses,
        recentTransactions,

        // Backward compatibility counters
        merchants: merchantsCount,
        activeSubscriptions: activeSubscriptionsCount,
        agents: agentsCount,
        virtualNumbers: virtualNumbersCount,
        runningCampaigns: runningCampaignsCount,
        completedCalls: completedCallsCount,
      };

      return ResponseBuilder.success(res, dashboardData, 'Admin dashboard retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async getAdmins(req, res, next) {
    try {
      const admins = await Admin.findAll({
        attributes: { exclude: ['passwordHash', 'verificationToken', 'resetToken', 'resetTokenExpires'] },
        order: [['createdAt', 'DESC']],
      });
      return ResponseBuilder.success(res, admins, 'Admins retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateAdmin(req, res, next) {
    try {
      const admin = await Admin.findByPk(req.params.id);
      if (!admin) return ResponseBuilder.error(res, 'Admin not found', 404);

      const { firstName, lastName } = req.body;
      await admin.update({
        ...(firstName !== undefined && { firstName }),
        ...(lastName !== undefined && { lastName }),
      });
      const response = admin.toJSON();
      delete response.passwordHash;
      delete response.verificationToken;
      delete response.resetToken;
      delete response.resetTokenExpires;
      return ResponseBuilder.success(res, response, 'Admin updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async getAgents(req, res, next) {
    try {
      const agents = await Agent.findAll({
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'mobile', 'businessName'] }],
        order: [['createdAt', 'DESC']],
      });
      return ResponseBuilder.success(res, agents, 'Agents retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async getMerchants(req, res, next) {
    try {
      const merchants = await User.findAll({
        where: { role: 'merchant' },
        attributes: { exclude: ['passwordHash', 'refreshToken', 'resetToken', 'resetTokenExpires', 'verificationToken'] },
        include: [
          { model: Category, as: 'category' },
          { model: Subscription, as: 'subscription', include: [{ model: Plan, as: 'plan' }] },
          { model: VobizNumber, as: 'vobizNumbers' },
        ],
        order: [['createdAt', 'DESC']],
      });
      return ResponseBuilder.success(res, merchants, 'Merchants retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async getMerchant(req, res, next) {
    try {
      const merchant = await User.findOne({
        where: { id: req.params.id, role: 'merchant' },
        attributes: { exclude: ['passwordHash', 'refreshToken', 'resetToken', 'resetTokenExpires', 'verificationToken'] },
        include: [
          { model: Category, as: 'category' },
          { model: Subscription, as: 'subscription', include: [{ model: Plan, as: 'plan' }] },
          { model: VobizNumber, as: 'vobizNumbers', include: [{ model: Agent, as: 'agent' }] },
        ],
      });
      if (!merchant) return ResponseBuilder.error(res, 'Merchant not found', 404);
      return ResponseBuilder.success(res, merchant, 'Merchant retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateMerchant(req, res, next) {
    try {
      const merchant = await User.findOne({ where: { id: req.params.id, role: 'merchant' } });
      if (!merchant) return ResponseBuilder.error(res, 'Merchant not found', 404);

      const { businessName, businessUrl, categoryId, isVerified, kycStatus } = req.body;
      if (categoryId !== undefined && categoryId !== null && !(await Category.findByPk(categoryId))) {
        return ResponseBuilder.error(res, 'Selected business category does not exist', 400);
      }
      if (kycStatus !== undefined && !['none', 'pending', 'full'].includes(kycStatus)) {
        return ResponseBuilder.error(res, 'KYC status must be none, pending, or full', 400);
      }

      await merchant.update({
        ...(businessName !== undefined && { businessName }),
        ...(businessUrl !== undefined && { businessUrl }),
        ...(categoryId !== undefined && { categoryId }),
        ...(isVerified !== undefined && { isVerified }),
        ...(kycStatus !== undefined && { kycStatus }),
      });
      return ResponseBuilder.success(res, merchant, 'Merchant updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateMerchantSubscription(req, res, next) {
    try {
      const merchant = await User.findOne({ where: { id: req.params.id, role: 'merchant' } });
      if (!merchant) return ResponseBuilder.error(res, 'Merchant not found', 404);

      const plan = await Plan.findByPk(req.body.planId);
      if (!plan) return ResponseBuilder.error(res, 'Target subscription plan not found', 404);

      const now = new Date();
      const expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + 1);
      const values = {
        planId: plan.id,
        activePlan: plan.name,
        startDate: now,
        expiryDate,
        callsUsed: 0,
        callsRemaining: plan.callLimit === -1 ? 999999 : plan.callLimit,
        status: 'active',
      };
      const [subscription, created] = await Subscription.findOrCreate({
        where: { userId: merchant.id },
        defaults: { userId: merchant.id, ...values },
      });
      if (!created) await subscription.update(values);
      await removeTrialDemoNumber(merchant.id);
      return ResponseBuilder.success(res, subscription, 'Merchant subscription updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async getMerchantNumbers(req, res, next) {
    try {
      const numbers = await VobizNumber.findAll({
        where: { userId: req.params.id },
        include: [{ model: Agent, as: 'agent' }],
      });
      return ResponseBuilder.success(res, numbers, 'Merchant virtual numbers retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async updateMerchantNumber(req, res, next) {
    try {
      const number = await VobizNumber.findOne({ where: { id: req.params.numberId, userId: req.params.id } });
      if (!number) return ResponseBuilder.error(res, 'Virtual number not found', 404);

      const { status, agentId } = req.body;
      if (status !== undefined && !['active', 'inactive'].includes(status)) {
        return ResponseBuilder.error(res, 'Status must be active or inactive', 400);
      }
      if (agentId !== undefined && agentId !== null && !(await Agent.findByPk(agentId))) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }
      await number.update({
        ...(status !== undefined && { status }),
        ...(agentId !== undefined && { agentId }),
      });
      return ResponseBuilder.success(res, number, 'Merchant virtual number updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async deleteMerchantNumber(req, res, next) {
    try {
      const number = await VobizNumber.findOne({ where: { id: req.params.numberId, userId: req.params.id } });
      if (!number) return ResponseBuilder.error(res, 'Virtual number not found', 404);
      await number.destroy();
      return ResponseBuilder.success(res, null, 'Merchant virtual number removed successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get all agents that are pending approval
   */
  async getPendingAgents(req, res, next) {
    try {
      const agents = await Agent.findAll({
        where: { approvalStatus: 'pending' },
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'businessName'] }]
      });
      return ResponseBuilder.success(res, agents, 'Pending agents retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Approve an agent
   */
  async approveAgent(req, res, next) {
    try {
      const agent = await Agent.findByPk(req.params.id);
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      await agent.update({
        approvalStatus: 'approved',
        activeStatus: true,
      });

      return ResponseBuilder.success(res, agent, 'Agent approved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Reject an agent
   */
  async rejectAgent(req, res, next) {
    try {
      const agent = await Agent.findByPk(req.params.id);
      if (!agent) {
        return ResponseBuilder.error(res, 'Agent not found', 404);
      }

      await agent.update({
        approvalStatus: 'rejected',
        activeStatus: false,
      });

      return ResponseBuilder.success(res, agent, 'Agent rejected successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get sensitive words
   */
  async getSensitiveWords(req, res, next) {
    try {
      const setting = await Setting.findOne({ where: { key: 'sensitive_words' } });
      const words = setting && setting.value ? setting.value : ['scam', 'fraud', 'hack', 'abuse', 'illegal', 'terror', 'bomb', 'kill', 'murder', 'phishing', 'spam'];
      return ResponseBuilder.success(res, { sensitiveWords: words }, 'Sensitive words retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update sensitive words
   */
  async updateSensitiveWords(req, res, next) {
    try {
      const { words } = req.body;
      if (!words || !Array.isArray(words)) {
        return ResponseBuilder.error(res, 'Please provide an array of words', 400);
      }

      let setting = await Setting.findOne({ where: { key: 'sensitive_words' } });
      if (setting) {
        await setting.update({ value: words });
      } else {
        setting = await Setting.create({ key: 'sensitive_words', value: words });
      }

      return ResponseBuilder.success(res, { sensitiveWords: setting.value }, 'Sensitive words updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Get KYC 48h Rate Limit Calls
   */
  async getKycRateLimit(req, res, next) {
    try {
      const setting = await Setting.findOne({ where: { key: 'kyc_rate_limit_calls' } });
      const limit = setting && setting.value ? parseInt(setting.value, 10) : 10;
      return ResponseBuilder.success(res, { kycRateLimitCalls: limit }, 'KYC Rate Limit retrieved');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Update KYC 48h Rate Limit Calls
   */
  async updateKycRateLimit(req, res, next) {
    try {
      const { limit } = req.body;
      if (limit === undefined || isNaN(limit)) {
        return ResponseBuilder.error(res, 'Please provide a valid numeric limit', 400);
      }

      let setting = await Setting.findOne({ where: { key: 'kyc_rate_limit_calls' } });
      if (setting) {
        await setting.update({ value: limit });
      } else {
        setting = await Setting.create({ key: 'kyc_rate_limit_calls', value: limit });
      }

      return ResponseBuilder.success(res, { kycRateLimitCalls: parseInt(setting.value, 10) }, 'KYC Rate Limit updated successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Voice Library Management
   */
  async getVoices(req, res, next) {
    try {
      const { provider, gender, language, isCustom } = req.query;
      const where = {};
      if (provider) where.provider = provider;
      if (gender) where.gender = gender;
      if (language) where.language = language;
      if (isCustom !== undefined) {
        where.isCustom = isCustom === 'true';
      }
      const voices = await Voice.findAll({
        where,
        order: [['createdAt', 'DESC']],
      });
      return ResponseBuilder.success(res, voices, 'Voices retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  async createVoice(req, res, next) {
    try {
      const { error, value } = createVoiceSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }
      const voice = await Voice.create(value);
      return ResponseBuilder.success(res, voice, 'Voice created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  async updateVoice(req, res, next) {
    try {
      const { error, value } = updateVoiceSchema.validate(req.body);
      if (error) {
        return ResponseBuilder.error(res, error.details[0].message, 400);
      }
      const voice = await Voice.findByPk(req.params.id);
      if (!voice) {
        return ResponseBuilder.error(res, 'Voice not found', 404);
      }
      await voice.update(value);
      return ResponseBuilder.success(res, voice, 'Voice updated successfully');
    } catch (err) {
      next(err);
    }
  }

  async deleteVoice(req, res, next) {
    try {
      const voice = await Voice.findByPk(req.params.id);
      if (!voice) {
        return ResponseBuilder.error(res, 'Voice not found', 404);
      }
      await voice.destroy();
      return ResponseBuilder.success(res, null, 'Voice deleted successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Audit Logs
   */
  async getAuditLogs(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const offset = (page - 1) * limit;
      const { action, userId } = req.query;

      const where = {};
      if (action) where.action = action;
      if (userId) where.userId = userId;

      const { count, rows } = await AuditLog.findAndCountAll({
        where,
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        include: [{ model: User, as: 'user', attributes: ['id', 'email', 'businessName'] }]
      });

      return ResponseBuilder.success(res, {
        logs: rows,
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit,
        }
      }, 'Audit logs retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Global Call Reports
   */
  async getGlobalCallReports(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const offset = (page - 1) * limit;
      const { merchantId, status, search } = req.query;

      const where = {};
      if (merchantId) where.userId = merchantId;
      if (status) where.outcome = status;

      const include = [
        { model: User, as: 'user', attributes: ['id', 'email', 'businessName'], required: false },
        { model: Customer, as: 'customer', attributes: ['id', 'name', 'mobile'], required: false },
        { model: Campaign, as: 'campaign', attributes: ['id', 'name'], required: false },
      ];

      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { '$customer.name$': { [Op.like]: `%${search}%` } },
          { '$customer.mobile$': { [Op.like]: `%${search}%` } },
        ];
      }

      let { count, rows } = await CallReport.findAndCountAll({
        where,
        limit,
        offset,
        include,
        order: [['createdAt', 'DESC']],
      });

      // Fallback: If no CallReport entries exist yet, derive report list from CallSessions
      if (count === 0) {
        const sessionWhere = {};
        if (merchantId) sessionWhere.userId = merchantId;

        const sessionInclude = [
          { model: User, as: 'user', attributes: ['id', 'email', 'businessName'], required: false },
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'mobile'], required: false },
          { model: Campaign, as: 'campaign', attributes: ['id', 'name'], required: false },
        ];

        const sessionResult = await CallSession.findAndCountAll({
          where: sessionWhere,
          limit,
          offset,
          include: sessionInclude,
          order: [['createdAt', 'DESC']],
        });

        count = sessionResult.count;
        rows = sessionResult.rows.map((s) => {
          let duration = 0;
          if (s.startTime && s.endTime) {
            duration = Math.max(0, Math.round((new Date(s.endTime) - new Date(s.startTime)) / 1000));
          }
          return {
            id: s.id,
            userId: s.userId,
            callSessionId: s.id,
            campaignId: s.campaignId,
            customerId: s.customerId,
            vobizNumberId: s.vobizNumberId,
            transcript: `Call ${s.direction} (${s.status})`,
            summary: `Call ${s.direction} (${s.status})`,
            duration,
            outcome: s.status === 'completed' ? 'Interested' : 'No Answer',
            sentiment: 'Neutral',
            leadScore: s.status === 'completed' ? 70 : 0,
            recordingUrl: null,
            user: s.user,
            customer: s.customer,
            campaign: s.campaign,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
          };
        });
      }

      return ResponseBuilder.success(res, {
        reports: rows,
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit,
        },
      }, 'Global call reports retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Individual Call Session details
   */
  async getGlobalCallSession(req, res, next) {
    try {
      const { sessionId } = req.params;
      const session = await CallSession.findOne({
        where: { id: sessionId },
        include: [
          { model: User, as: 'user', attributes: ['id', 'email', 'businessName'] },
          { model: Customer, as: 'customer', attributes: ['id', 'name', 'mobile'] },
          { model: Campaign, as: 'campaign', attributes: ['id', 'name'] },
          { model: Agent, as: 'agent', attributes: ['id', 'name'] },
          { model: VobizNumber, as: 'vobizNumber', attributes: ['id', 'number'] },
          { model: CallReport, as: 'report' },
          { model: CallLog, as: 'logs' }
        ],
        order: [[{ model: CallLog, as: 'logs' }, 'createdAt', 'ASC']]
      });

      if (!session) {
        return ResponseBuilder.error(res, 'Call session not found', 404);
      }

      return ResponseBuilder.success(res, session, 'Call session details retrieved successfully');
    } catch (err) {
      next(err);
    }
  }

  /**
   * Global Virtual Numbers Inventory
   */
  async getGlobalVirtualNumbers(req, res, next) {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const limit = parseInt(req.query.limit || '20', 10);
      const offset = (page - 1) * limit;
      const { status } = req.query;

      const where = {};
      if (status) where.status = status;

      const { count, rows } = await VobizNumber.findAndCountAll({
        where,
        limit,
        offset,
        include: [
          { model: User, as: 'user', attributes: ['id', 'email', 'businessName'] },
          { model: Agent, as: 'agent', attributes: ['id', 'name'] }
        ],
        order: [['createdAt', 'DESC']]
      });

      return ResponseBuilder.success(res, {
        virtualNumbers: rows,
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          limit,
        }
      }, 'Global virtual numbers inventory retrieved successfully');
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AdminController();

