const { sequelize } = require('../src/models');

async function alter() {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    // Check if column already exists
    const [results] = await sequelize.query("SHOW COLUMNS FROM vobiz_numbers LIKE 'rental_expiry_date'");
    if (results.length === 0) {
      console.log("Adding column 'rental_expiry_date' to table 'vobiz_numbers'...");
      await sequelize.query("ALTER TABLE vobiz_numbers ADD COLUMN rental_expiry_date DATETIME NULL AFTER status");
      console.log("Column 'rental_expiry_date' added successfully.");
    } else {
      console.log("Column 'rental_expiry_date' already exists.");
    }
    process.exit(0);
  } catch (error) {
    console.error('Error altering table:', error);
    process.exit(1);
  }
}

alter();
