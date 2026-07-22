const express = require('express');
const settingRoutes = require('../src/routes/settingRoutes');
const sequelize = require('../src/config/database');

async function test() {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    console.log('settingRoutes loaded successfully');
  } catch (err) {
    console.error('Test failed:', err);
  } finally {
    await sequelize.close();
  }
}

test();
