const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixAdminPermissions() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Fixing Admin role permissions...');

    // Get Admin role id
    const [roles] = await connection.query('SELECT id FROM roles WHERE name = "Admin"');
    if (roles.length === 0) {
      console.log('Admin role not found');
      return;
    }
    const adminRoleId = roles[0].id;
    console.log('Admin role ID:', adminRoleId);

    // Get all permission IDs
    const [permissions] = await connection.query('SELECT id FROM permissions');
    const permissionIds = permissions.map(p => p.id);
    console.log('Total permissions:', permissionIds.length);

    // Clear existing permissions for Admin role
    await connection.query('DELETE FROM role_permissions WHERE role_id = ?', [adminRoleId]);
    console.log('Cleared existing Admin role permissions');

    // Assign all permissions to Admin role
    const values = permissionIds.map(permissionId => [adminRoleId, permissionId]);
    await connection.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ?', [values]);
    console.log('Assigned all permissions to Admin role');

    // Verify
    const [adminPermissions] = await connection.query(`
      SELECT p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `, [adminRoleId]);
    
    console.log('\nAdmin role now has these permissions:');
    adminPermissions.forEach(p => console.log(' -', p.name));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

fixAdminPermissions();
