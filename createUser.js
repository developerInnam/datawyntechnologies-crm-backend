const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function createUser() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'crm_system'
  });

  try {
    // Check if Admin role exists
    const [roles] = await connection.query('SELECT id FROM roles WHERE name = ?', ['Admin']);
    let role_id;
    
    if (roles.length === 0) {
      console.log('Creating Admin role...');
      const [result] = await connection.query('INSERT INTO roles (name) VALUES (?)', ['Admin']);
      role_id = result.insertId;
      console.log('✅ Admin role created with ID:', role_id);
    } else {
      role_id = roles[0].id;
      console.log('✅ Admin role exists with ID:', role_id);
    }

    const email = 'admin@crm.com';
    const password = 'admin123';
    const name = 'Admin User';
    const phone = '1234567890';

    // Check if user already exists
    const [existing] = await connection.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      console.log('User already exists. Deleting old user...');
      await connection.query('DELETE FROM users WHERE email = ?', [email]);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await connection.query(
      'INSERT INTO users (name, email, phone, password, role_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, role_id, 'active']
    );

    console.log('✅ User created successfully!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('User ID:', result.insertId);
  } catch (error) {
    console.error('❌ Error creating user:', error.message);
  } finally {
    await connection.end();
  }
}

createUser();
