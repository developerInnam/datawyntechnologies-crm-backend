const db = require('./config/db');
const fs = require('fs');

const sql = fs.readFileSync('./migrate_add_user_permissions.sql', 'utf8');

// Split SQL statements by semicolon and execute them one by one
const statements = sql.split(';').filter(s => s.trim());

async function runMigration() {
  try {
    for (const statement of statements) {
      if (statement.trim()) {
        await db.query(statement);
      }
    }
    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
