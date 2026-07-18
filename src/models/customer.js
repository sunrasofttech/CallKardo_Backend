const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Customer extends Model {}

Customer.init(
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
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    tags: {
      type: DataTypes.STRING(255),
      allowNull: true, // Could be comma-separated or stored as string
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Customer',
    tableName: 'customers',
    indexes: [
      {
        unique: true,
        fields: ['user_id', 'mobile'],
        name: 'uq_merchant_customer_mobile',
      },
    ],
  }
);

module.exports = Customer;
