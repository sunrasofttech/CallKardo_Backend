const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Category extends Model {}

Category.init(
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
    defaultPrompt: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'default_prompt',
    },
    defaultVoiceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'default_voice_id',
    },
    defaultLanguage: {
      type: DataTypes.STRING(10),
      defaultValue: 'hi',
      field: 'default_language',
    },
    defaultAgentConfig: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'default_agent_config',
    },
  },
  {
    sequelize,
    modelName: 'Category',
    tableName: 'categories',
  }
);

module.exports = Category;
