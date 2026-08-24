const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MerchantMessageProgram = sequelize.define(
  'MerchantMessageProgram',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending',
    },
    submitted_documents: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    credentials: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    channel_mode: {
      type: DataTypes.STRING(20),
      defaultValue: 'rcs',
    },
    admin_feedback: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    tableName: 'merchant_message_programs',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  }
);

module.exports = MerchantMessageProgram;
