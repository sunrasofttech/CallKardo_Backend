const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Meeting extends Model {}

Meeting.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    merchantId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'merchant_id',
    },
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_id',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'agent_id',
    },
    callSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'call_session_id',
    },
    title: {
      type: DataTypes.STRING(150),
      defaultValue: 'Merchant Onboarding Demo & Meeting',
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    meetingTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'meeting_time',
    },
    meetingLink: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'meeting_link',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'scheduled', // 'scheduled', 'completed', 'cancelled', 'rescheduled'
    },
    reminderCallTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reminder_call_time',
    },
    reminderCallStatus: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending', // 'pending', 'initiated', 'completed', 'failed', 'skipped'
      field: 'reminder_call_status',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Meeting',
    tableName: 'meetings',
  }
);

module.exports = Meeting;
