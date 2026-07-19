const db = require('./config/db');

async function runMigration() {
  try {
    console.log('Starting control_permission_request migration...');
    
    // Insert the new permission
    console.log('Adding control_permission_request permission...');
    await db.query(`
      INSERT INTO permissions (name) VALUES 
      ('control_permission_request')
      ON DUPLICATE KEY UPDATE name=name
    `);
    console.log('✅ Permission added successfully');

    // Check if Admin role exists
    console.log('Checking if Admin role exists...');
    const [roles] = await db.query('SELECT id FROM roles WHERE name = "Admin" OR id = 1');
    
    if (roles.length === 0) {
      console.log('Creating Admin role...');
      await db.query('INSERT INTO roles (name) VALUES ("Admin")');
      console.log('✅ Admin role created');
    }

    // Get the permission ID
    const [permission] = await db.query('SELECT id FROM permissions WHERE name = "control_permission_request"');
    const permissionId = permission[0].id;

    // Get the Admin role ID
    const [adminRole] = await db.query('SELECT id FROM roles WHERE name = "Admin" OR id = 1 LIMIT 1');
    const adminRoleId = adminRole[0].id;

    // Assign this permission to Admin role
    console.log(`Assigning permission to Admin role (ID: ${adminRoleId})...`);
    await db.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE role_id=role_id
    `, [adminRoleId, permissionId]);
    console.log('✅ Permission assigned to Admin role');

    // Verify the new permission
    console.log('Verifying permission...');
    const [permissions] = await db.query(`
      SELECT * FROM permissions WHERE name = 'control_permission_request'
    `);
    console.log('✅ Permission verified:', permissions);

    console.log('✅ Migration completed successfully!');
    console.log('The control_permission_request permission has been added to the database.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

runMigration();
