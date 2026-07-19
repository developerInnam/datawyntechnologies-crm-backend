const db = require('./config/db');

async function runMigration() {
  try {
    // Check if column already exists
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = 'crm_system' 
      AND TABLE_NAME = 'clients' 
      AND COLUMN_NAME = 'is_converted'
    `);
    
    if (columns.length > 0) {
      console.log('Column is_converted already exists');
      process.exit(0);
    }
    
    // Add the column
    await db.query('ALTER TABLE clients ADD COLUMN is_converted TINYINT(1) DEFAULT 0');
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
