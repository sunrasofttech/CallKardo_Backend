const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./user');

class KycDetail extends Model {}

KycDetail.init(
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
      references: {
        model: 'users',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    documentType: {
      type: DataTypes.STRING(50), // 'pan', 'gst', 'aadhaar', 'cin'
      allowNull: true,
      field: 'document_type',
    },
    documentData: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'document_data',
    },
    sessionId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'session_id',
    },
    status: {
      type: DataTypes.STRING(20), // 'pending', 'verified', 'failed'
      defaultValue: 'pending',
    },
    vobizResponse: {
      type: DataTypes.JSON, // Store Vobiz verification response
      allowNull: true,
      field: 'vobiz_response',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
    }
  },
  {
    sequelize,
    modelName: 'KycDetail',
    tableName: 'kyc_details',
  }
);

// Setup associations
User.hasMany(KycDetail, { foreignKey: 'userId', as: 'kycDetails' });
KycDetail.belongsTo(User, { foreignKey: 'userId', as: 'user' });

module.exports = KycDetail;
