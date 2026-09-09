const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class SubscriptionHistory extends Model {}

SubscriptionHistory.init(
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
    adminId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'admin_id',
    },
    previousPlanId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'previous_plan_id',
    },
    previousPlanName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'previous_plan_name',
    },
    newPlanId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'new_plan_id',
    },
    newPlanName: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'new_plan_name',
    },
    actionType: {
      type: DataTypes.STRING(50),
      defaultValue: 'ADMIN_UPGRADE',
      field: 'action_type',
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'start_date',
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expiry_date',
    },
    callsLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'calls_limit',
    },
    callsUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'calls_used',
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'SubscriptionHistory',
    tableName: 'subscription_histories',
    timestamps: true,
    underscored: true,
  }
);

module.exports = SubscriptionHistory;
