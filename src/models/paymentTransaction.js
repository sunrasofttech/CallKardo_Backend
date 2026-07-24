const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class PaymentTransaction extends Model {}

PaymentTransaction.init(
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
    orderId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      field: 'order_id',
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false, // 'SUBSCRIPTION' or 'VOBIZ_NUMBER'
    },
    targetId: {
      type: DataTypes.STRING(255),
      allowNull: false, // planId or phone number
      field: 'target_id',
    },
    amount: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'INR',
    },
    status: {
      type: DataTypes.STRING(30),
      defaultValue: 'pending', // pending, success, failed, cancelled
    },
    customerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'customer_name',
    },
    customerMobile: {
      type: DataTypes.STRING(30),
      allowNull: true,
      field: 'customer_mobile',
    },
    customerEmail: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'customer_email',
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    gatewayTransactionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'gateway_transaction_id',
    },
    paymentUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'payment_url',
    },
    upiString: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'upi_string',
    },
    urnNumber: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'urn_number',
    },
    rawResponse: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'raw_response',
    },
    rawWebhookData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'raw_webhook_data',
    },
  },
  {
    sequelize,
    modelName: 'PaymentTransaction',
    tableName: 'payment_transactions',
    indexes: [
      {
        fields: ['user_id'],
        name: 'idx_payment_tx_user',
      },
      {
        fields: ['order_id'],
        name: 'idx_payment_tx_order',
      },
      {
        fields: ['status'],
        name: 'idx_payment_tx_status',
      },
    ],
  }
);

module.exports = PaymentTransaction;
