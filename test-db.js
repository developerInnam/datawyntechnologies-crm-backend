const db = require('./config/db');

async function testDB() {
  try {
    const [rows] = await db.query('SELECT 1');
    console.log('✅ Database connection successful');
    console.log('Test query result:', rows);
    
    // Test if clients table exists
    const [clients] = await db.query('SHOW TABLES LIKE "clients"');
    console.log('Clients table exists:', clients.length > 0);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  }
}

testDB();
