const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProgramDocumentRequirement = sequelize.define(
  'ProgramDocumentRequirement',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    provider: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    document_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    is_required: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    tableName: 'program_document_requirements',
    timestamps: true,
    paranoid: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    deletedAt: 'deleted_at',
  }
);

module.exports = ProgramDocumentRequirement;
