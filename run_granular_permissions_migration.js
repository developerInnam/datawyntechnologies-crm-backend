const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'crm_system',
    multipleStatements: true
  });

  try {
    const [adminRole] = await connection.query("SELECT id FROM roles WHERE name = 'Admin' LIMIT 1");
    const adminRoleId = adminRole.length > 0 ? adminRole[0].id : 1;

    const migrationPath = path.join(__dirname, 'migrate_add_granular_permissions.sql');
    let sql = fs.readFileSync(migrationPath, 'utf8');
    sql = sql.replace("SELECT 1, id FROM permissions WHERE name IN (", "SELECT " + adminRoleId + ", id FROM permissions WHERE name IN (");

    await connection.query(sql);
    console.log(`Migration completed successfully: granular permissions added to role ${adminRoleId}`);
  } catch (error) {
    console.error('Error running migration:', error);
  } finally {
    await connection.end();
  }
}

runMigration();
