const db = require('./config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    console.log('Running card_title migration...');
    
    const migrationPath = path.join(__dirname, 'migrations', '20260707_add_card_title_to_custom_fields.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    await db.query(sql);
    console.log('✓ Migration completed successfully!');
    console.log('✓ Added card_title field to custom_field_definitions table');
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
