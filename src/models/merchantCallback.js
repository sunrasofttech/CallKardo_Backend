const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class MerchantCallback extends Model {}

MerchantCallback.init(
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
    requestedTime: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'requested_time',
    },
    scheduledTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'scheduled_time',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending', // 'pending', 'in_progress', 'completed', 'failed', 'cancelled'
    },
    callbackSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'callback_session_id',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'MerchantCallback',
    tableName: 'merchant_callbacks',
  }
);

module.exports = MerchantCallback;
