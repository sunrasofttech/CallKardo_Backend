const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

/**
 * A request made by a customer during a call to be reached on a different
 * mobile number (a friend's / family member's number, or their own second phone):
 *  - 'send_details': send details/links there (e.g. primary phone has no WhatsApp),
 *    processed in the background by the message worker.
 *  - 'callback': call back on that number to continue the conversation,
 *    scheduled in Redis and dialed by the call worker.
 */
class AlternateContactRequest extends Model {}

AlternateContactRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    merchantId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'merchant_id',
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'customer_id',
    },
    agentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'agent_id',
    },
    callSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'call_session_id',
    },
    customerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'customer_name',
    },
    originalMobile: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'original_mobile',
    },
    alternateMobile: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'alternate_mobile',
    },
    requestType: {
      type: DataTypes.STRING(20),
      defaultValue: 'send_details', // 'send_details', 'callback'
      field: 'request_type',
    },
    contentType: {
      type: DataTypes.STRING(30),
      defaultValue: 'details', // 'details', 'website_link', 'join_link' ('callback' for callbacks)
      field: 'content_type',
    },
    requestedTime: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'requested_time',
    },
    scheduledTime: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'scheduled_time',
    },
    callbackSessionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'callback_session_id',
    },
    // Snapshot of merchant/agent info needed by the worker (the call is over by then)
    context: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      defaultValue: 'pending', // send_details: 'pending', 'processing', 'sent', 'failed'; callback: 'scheduled', 'dialing', 'dialed', 'failed'
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'last_error',
    },
    result: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
    },
  },
  {
    sequelize,
    modelName: 'AlternateContactRequest',
    tableName: 'alternate_contact_requests',
    indexes: [
      { fields: ['merchant_id'], name: 'idx_alt_contact_merchant' },
      { fields: ['customer_id'], name: 'idx_alt_contact_customer' },
      { fields: ['call_session_id'], name: 'idx_alt_contact_session' },
      { fields: ['status'], name: 'idx_alt_contact_status' },
      { fields: ['callback_session_id'], name: 'idx_alt_contact_callback_session' },
    ],
  }
);

module.exports = AlternateContactRequest;
