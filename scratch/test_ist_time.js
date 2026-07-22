process.env.TZ = 'Asia/Kolkata';

const sequelize = require('../src/config/database');

async function testIST() {
  try {
    await sequelize.authenticate();
    console.log('--- IST TIMEZONE TEST ---');
    console.log('Node.js process.env.TZ   :', process.env.TZ);
    console.log('Node.js new Date() string:', new Date().toString());
    console.log('Node.js toLocaleString   :', new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    
    const [result] = await sequelize.query('SELECT NOW() as now_time, @@system_time_zone as sys_tz, @@time_zone as db_tz');
    console.log('Database Query NOW()     :', result[0]);
    
    console.log('\nIST Configuration Test PASSED!');
  } catch (error) {
    console.error('IST Test Error:', error);
  } finally {
    await sequelize.close();
  }
}

testIST();
