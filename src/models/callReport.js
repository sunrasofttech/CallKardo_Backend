const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class CallReport extends Model {}

CallReport.init(
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
    campaignId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'campaign_id',
    },
    callSessionId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      field: 'call_session_id',
    },
    vobizNumberId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'vobiz_number_id',
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'customer_id',
    },
    transcript: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    duration: {
      type: DataTypes.INTEGER,
      defaultValue: 0, // in seconds
    },
    outcome: {
      type: DataTypes.STRING(30),
      allowNull: true, // Interested, Not Interested, Callback Requested, Appointment Booked, Sale Closed, Wrong Number, No Answer
    },
    sentiment: {
      type: DataTypes.STRING(20),
      allowNull: true, // Positive, Neutral, Negative
    },
    leadScore: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      field: 'lead_score',
    },
    recordingUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'recording_url',
    },
  },
  {
    sequelize,
    modelName: 'CallReport',
    tableName: 'call_reports',
    indexes: [
      {
        fields: ['user_id'],
        name: 'idx_call_reports_user',
      },
      {
        fields: ['campaign_id'],
        name: 'idx_call_reports_campaign',
      },
    ],
  }
);

module.exports = CallReport;
