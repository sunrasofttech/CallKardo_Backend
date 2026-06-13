const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Agent extends Model {}

Agent.init(
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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    systemPrompt: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'system_prompt',
    },
    language: {
      type: DataTypes.STRING(10),
      defaultValue: 'en',
    },
    voiceId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'voice_id',
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'category_id',
    },
    isCustom: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_custom',
    },
    activeStatus: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'active_status',
    },
    allowInterruption: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_interruption',
    },
    pace: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 1.00,
      field: 'pace',
    },
    temperature: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0.60,
      field: 'temperature',
    },
  },
  {
    sequelize,
    modelName: 'Agent',
    tableName: 'agents',
  }
);

module.exports = Agent;
