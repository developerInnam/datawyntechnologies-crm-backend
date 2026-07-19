const db = require('./config/db');

async function checkSchema() {
  try {
    const [rows] = await db.query('DESCRIBE clients');
    console.log('Current clients table columns:');
    rows.forEach(row => {
      console.log(`- ${row.Field} (${row.Type})`);
    });
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkSchema();
