const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Subscription extends Model {}

Subscription.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'user_id',
    },
    planId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'plan_id',
    },
    activePlan: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'active_plan',
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date',
    },
    expiryDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expiry_date',
    },
    callsUsed: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'calls_used',
    },
    callsRemaining: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'calls_remaining',
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'active', // active, expired, cancelled
    },
    isExpiringNotified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_expiring_notified',
    },
  },
  {
    sequelize,
    modelName: 'Subscription',
    tableName: 'subscriptions',
  }
);

module.exports = Subscription;
