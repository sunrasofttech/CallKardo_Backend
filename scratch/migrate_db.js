const { sequelize } = require('../src/models');

async function migrate() {
  try {
    console.log('Connecting to database for schema migration...');
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // 1. Modify users table columns to be NULLable
    console.log('Updating "users" table constraints...');
    await sequelize.query('ALTER TABLE users MODIFY COLUMN email VARCHAR(100) NULL;');
    await sequelize.query('ALTER TABLE users MODIFY COLUMN business_name VARCHAR(100) NULL;');
    console.log('✅ Updated email and business_name columns in "users" table to allow NULL.');

    // 2. Add business_url to users table if it doesn't exist
    const [columns] = await sequelize.query('SHOW COLUMNS FROM users LIKE "business_url";');
    if (columns.length === 0) {
      console.log('Adding "business_url" column to "users" table...');
      await sequelize.query('ALTER TABLE users ADD COLUMN business_url VARCHAR(255) NULL AFTER business_name;');
      console.log('✅ Added "business_url" column to "users" table.');
    } else {
      console.log('ℹ️ "business_url" column already exists in "users" table.');
    }

    // 3. Modify admins table columns to be NULLable
    console.log('Updating "admins" table constraints...');
    await sequelize.query('ALTER TABLE admins MODIFY COLUMN email VARCHAR(100) NULL;');
    console.log('✅ Updated email column in "admins" table to allow NULL.');

    console.log('\n🎉 Database schema migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
