const db = require('./config/db');

async function checkClientsTable() {
  try {
    console.log('Checking clients table structure...');
    const [columns] = await db.query('DESCRIBE clients');
    console.log('Clients table columns:');
    columns.forEach(col => {
      console.log(`- ${col.Field} (${col.Type})`);
    });
    
    console.log('\nChecking if assigned_to column exists...');
    const assignedToExists = columns.some(col => col.Field === 'assigned_to');
    console.log('assigned_to exists:', assignedToExists);
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkClientsTable();
