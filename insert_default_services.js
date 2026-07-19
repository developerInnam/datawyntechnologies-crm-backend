const db = require('./config/db');

async function insertDefaultServices() {
  try {
    await db.query(`
      INSERT INTO services (name, description) VALUES 
      ('SMM', 'Social Media Marketing'),
      ('Website', 'Website Development')
    `);
    console.log('Default services inserted successfully');
    process.exit(0);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('Default services already exist');
      process.exit(0);
    }
    console.error('Error:', error.message);
    process.exit(1);
  }
}

insertDefaultServices();
