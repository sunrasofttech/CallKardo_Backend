const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Plan extends Model {}

Plan.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    price: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0.00,
    },
    callLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0, // -1 means unlimited
      field: 'call_limit',
    },
    minuteLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: -1, // -1 means unlimited
      field: 'minute_limit',
    },
    maxConcurrentCalls: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      field: 'max_concurrent_calls',
    },
  },
  {
    sequelize,
    modelName: 'Plan',
    tableName: 'plans',
  }
);

module.exports = Plan;
