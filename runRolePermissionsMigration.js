const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();

async function runMigration() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    console.log('Reading migration script...');
    const sql = fs.readFileSync('./migrate_seed_role_permissions.sql', 'utf8');
    
    console.log('Executing migration script...');
    await connection.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('Role-permission data has been seeded.');
  } catch (error) {
    console.error('❌ Error running migration:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
