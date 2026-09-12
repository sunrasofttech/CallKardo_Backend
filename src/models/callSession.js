const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CallSession extends Model {}

CallSession.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    campaignId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'campaign_id',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'agent_id',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_id',
    },
    callType: {
      type: DataTypes.STRING(30),
      defaultValue: 'campaign', // 'campaign', 'merchant_onboarding', 'merchant_callback', 'meeting_reminder'
      field: 'call_type',
    },
    vobizNumberId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'vobiz_number_id',
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'customer_id',
    },
    geminiSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'gemini_session_id',
    },
    wsSessionToken: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      field: 'ws_session_token',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'initiated', // initiated, connected, completed, failed, no-answer, busy
    },
    direction: {
      type: DataTypes.STRING(10),
      allowNull: false,
      defaultValue: 'outbound', // 'inbound' or 'outbound'
    },
    vobizCallUuid: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'vobiz_call_uuid',
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'start_time',
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_time',
    },
    actions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
    },
  },
  {
    sequelize,
    modelName: 'CallSession',
    tableName: 'call_sessions',
  }
);

module.exports = CallSession;
