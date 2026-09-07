const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class VobizAccount extends Model {}

VobizAccount.init(
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
    customerId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'customer_id',
    },
    apiKey: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'api_key',
    },
    apiSecret: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'api_secret',
    },
    isImported: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_imported',
    },
  },
  {
    sequelize,
    modelName: 'VobizAccount',
    tableName: 'vobiz_accounts',
  }
);

module.exports = VobizAccount;
