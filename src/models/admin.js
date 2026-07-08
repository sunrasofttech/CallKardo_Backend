const { DataTypes, Model } = require('sequelize');
const sequelize = require('../config/database');

class Admin extends Model {}

Admin.init(
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
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'first_name',
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'last_name',
    },
    role: {
      type: DataTypes.STRING(20),
      defaultValue: 'super_admin',
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
  },
  {
    sequelize,
    modelName: 'Admin',
    tableName: 'admins',
  }
);

module.exports = Admin;
