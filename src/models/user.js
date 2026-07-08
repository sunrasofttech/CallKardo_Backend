const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class User extends Model {}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'password_hash',
    },
    businessName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'business_name',
    },
    businessUrl: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'business_url',
    },
    categoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'category_id',
    },
    role: {
      type: DataTypes.STRING(20),
      defaultValue: 'merchant',
    },
    kycStatus: {
      type: DataTypes.STRING(20),
      defaultValue: 'none', // 'none', 'pending', 'full'
      field: 'kyc_status',
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'is_verified',
    },
    verificationToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'verification_token',
    },
    resetToken: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'reset_token',
    },
    resetTokenExpires: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'reset_token_expires',
    },
    refreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'refresh_token',
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'users',
  }
);

module.exports = User;
