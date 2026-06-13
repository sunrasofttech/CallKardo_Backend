const { Sequelize } = require('sequelize');
const defaults = require('./defaults');

const isProduction = defaults.nodeEnv === 'production';

const sequelize = new Sequelize(
  defaults.db.name,
  defaults.db.user,
  defaults.db.password,
  {
    host: defaults.db.host,
    port: defaults.db.port,
    dialect: 'mysql',
    logging: isProduction ? false : console.log,
    pool: {
      max: 20,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      timestamps: true,
      underscored: true,
      paranoid: true, // Enables soft deletes (deleted_at)
    },
  }
);

module.exports = sequelize;
