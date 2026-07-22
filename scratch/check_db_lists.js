require('dotenv').config();
const { CustomerList, CustomerListMember, Customer, User } = require('../src/models');
const sequelize = require('../src/config/database');

async function checkDatabase() {
  try {
    await sequelize.authenticate();
    console.log('--- DATABASE CHECK FOR CUSTOMER GROUPS / LISTS ---');
    
    const lists = await CustomerList.findAll({
      include: [
        { model: User, as: 'user', attributes: ['id', 'email', 'role'] },
        { model: Customer, as: 'customers', attributes: ['id', 'name', 'mobile'] }
      ],
      paranoid: false // Include soft deleted if any
    });

    console.log(`Total Customer Lists found in DB: ${lists.length}`);
    lists.forEach((list, idx) => {
      console.log(`\n[List #${idx + 1}]`);
      console.log(`  List ID     : ${list.id}`);
      console.log(`  Name        : ${list.name}`);
      console.log(`  Description : ${list.description}`);
      console.log(`  User/Owner  : ${list.user ? `${list.user.email} - ID: ${list.user.id}` : list.userId}`);
      console.log(`  Deleted At  : ${list.deletedAt}`);
      console.log(`  Member Count: ${list.customers ? list.customers.length : 0}`);
      if (list.customers && list.customers.length > 0) {
        console.log(`  Members:`);
        list.customers.forEach((c, cIdx) => {
          console.log(`    - (${cIdx + 1}) ID: ${c.id} | Name: ${c.name} | Mobile: ${c.mobile}`);
        });
      }
    });

    if (lists.length === 0) {
      console.log('\nNo customer lists/groups currently exist in the database.');
    }

  } catch (error) {
    console.error('Error querying DB:', error);
  } finally {
    await sequelize.close();
  }
}

checkDatabase();
