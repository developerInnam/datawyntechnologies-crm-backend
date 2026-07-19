const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkRoles() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('Checking roles in database...');
    const [roles] = await connection.query('SELECT * FROM roles');
    console.log('Roles found:', roles);
    
    console.log('\nChecking permissions in database...');
    const [permissions] = await connection.query('SELECT * FROM permissions');
    console.log('Permissions found:', permissions);
    
    console.log('\nChecking role_permissions in database...');
    const [rolePermissions] = await connection.query('SELECT * FROM role_permissions');
    console.log('Role permissions found:', rolePermissions);
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkRoles();
