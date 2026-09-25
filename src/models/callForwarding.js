const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * Links a merchant's personal/business mobile to one of their VoBiz numbers.
 * The merchant sets call forwarding on their own phone towards the VoBiz number,
 * and calls landing on it are answered by a dedicated forwarding agent
 * (separate from the number's default agent).
 */
class CallForwarding extends Model {}

CallForwarding.init(
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
    vobizNumberId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'vobiz_number_id',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'agent_id',
    },
    // The merchant's own phone number that forwards to the VoBiz number
    personalNumber: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'personal_number',
    },
    forwardingType: {
      type: DataTypes.STRING(20),
      defaultValue: 'all', // 'all', 'busy', 'unanswered', 'unreachable'
      field: 'forwarding_type',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active', // 'active', 'inactive'
    },
    lastCallAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_call_at',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'CallForwarding',
    tableName: 'call_forwardings',
    indexes: [
      { fields: ['user_id'], name: 'idx_call_fwd_user' },
      { fields: ['vobiz_number_id'], name: 'idx_call_fwd_number' },
      { fields: ['agent_id'], name: 'idx_call_fwd_agent' },
      { fields: ['status'], name: 'idx_call_fwd_status' },
    ],
  }
);

module.exports = CallForwarding;
