const express = require('express');
const router = express.Router();
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, role_id } = req.body;

    // Check if user already exists
    const [existingUser] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await db.query(
      'INSERT INTO users (name, email, phone, password, role_id, status) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, role_id || null, 'active']
    );

    res.status(201).json({ 
      message: 'User registered successfully', 
      userId: result.insertId 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt for email:', email);

    // Find user by email
    const [users] = await db.query(`
      SELECT u.*, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.email = ?
    `, [email]);

    console.log('Users found:', users.length);

    if (users.length === 0) {
      console.log('User not found for email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    console.log('User found:', user.email, 'Status:', user.status);

    // Check if user is active
    if (user.status !== 'active') {
      console.log('User inactive:', user.status);
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Verify password
    console.log('Comparing password...');
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match:', isMatch);
    
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user permissions from role
    const [permissions] = await db.query(`
      SELECT p.id, p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `, [user.role_id]);

    // Create JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role_name, role_id: user.role_id },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('Login successful for:', email);
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role_name,
        role_id: user.role_id,
        phone: user.phone,
        permissions: permissions.map(p => p.name)
      }
    });
  } catch (error) {
    console.error('Login error:', error.code || error.message);

    if (error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST') {
      return res.status(500).json({ error: 'Database connection failed. Make sure MySQL is running.' });
    }
    if (error.code === 'ER_BAD_DB_ERROR') {
      return res.status(500).json({ error: 'Database not found. Run backend/database.sql to create it.' });
    }
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({ error: 'Database tables missing. Run backend/database.sql to create them.' });
    }

    res.status(500).json({ error: error.message || 'Server error during login' });
  }
});

// Get current user (protected route)
router.get('/me', async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [users] = await db.query(`
      SELECT u.id, u.name, u.email, u.phone, u.role_id, u.status, r.name as role_name 
      FROM users u 
      LEFT JOIN roles r ON u.role_id = r.id 
      WHERE u.id = ?
    `, [decoded.userId]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];

    // Get user permissions from role
    const [permissions] = await db.query(`
      SELECT p.id, p.name 
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `, [user.role_id]);

    user.permissions = permissions.map(p => p.name);
    user.dashboard_theme = user.dashboard_theme || 'light';

    res.json(user);


  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

module.exports = router;
