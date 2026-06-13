const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Voice extends Model {}

Voice.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING(50),
      allowNull: false, // 'sarvam', etc.
    },
    voiceId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'voice_id',
    },
    language: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    gender: {
      type: DataTypes.STRING(10),
      allowNull: false, // male, female, neutral
    },
    isCustom: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_custom',
    },
    sampleText: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'sample_text',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
    },
  },
  {
    sequelize,
    modelName: 'Voice',
    tableName: 'voices',
  }
);

module.exports = Voice;
