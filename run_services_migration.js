const db = require('./config/db');
const fs = require('fs');
const path = require('path');

async function runServicesMigration() {
  try {
    console.log('Starting services database migration...');

    // Read and execute services table migration
    const servicesMigration = fs.readFileSync(
      path.join(__dirname, 'migrations/20260629_add_services_table.sql'),
      'utf8'
    );
    console.log('Creating services table...');
    await db.query(servicesMigration);
    console.log('✅ Services table created successfully');

    // Read and execute client_services table migration
    const clientServicesMigration = fs.readFileSync(
      path.join(__dirname, 'migrations/20260629_add_client_services_table.sql'),
      'utf8'
    );
    console.log('Creating client_services junction table...');
    await db.query(clientServicesMigration);
    console.log('✅ Client_services table created successfully');

    console.log('✅ Services migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runServicesMigration();
