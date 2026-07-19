const db = require('./config/db');
require('dotenv').config();

async function diagnosePermissions() {
  try {
    console.log('🔍 PERMISSION SYSTEM DIAGNOSTIC\n');

    // Check permission_requests table structure
    console.log('📋 Checking permission_requests table structure...');
    const [columns] = await db.query(`DESCRIBE permission_requests`);
    console.log('Columns:', columns.map(c => `${c.Field}(${c.Type})`).join(', '));

    // Check for duplicate approved permissions
    console.log('\n🔴 Looking for duplicate APPROVED permissions (potential issue)...');
    const [duplicates] = await db.query(`
      SELECT user_id, permission_name, resource_type, resource_id, COUNT(*) as count
      FROM permission_requests 
      WHERE status = 'approved'
      GROUP BY user_id, permission_name, resource_type, resource_id
      HAVING count > 1
    `);
    
    if (duplicates.length > 0) {
      console.log('⚠️  FOUND DUPLICATES! Users can edit multiple times because multiple approved requests exist:');
      duplicates.forEach(dup => {
        console.log(`  - User ${dup.user_id}: ${dup.permission_name} on ${dup.resource_type} ${dup.resource_id} (${dup.count} requests)`);
      });
    } else {
      console.log('✅ No duplicate approved permissions found');
    }

    // Show sample permission requests
    console.log('\n📊 Recent permission requests (last 10):');
    const [recent] = await db.query(`
      SELECT id, user_id, permission_name, resource_type, resource_id, status, requested_at
      FROM permission_requests 
      ORDER BY id DESC 
      LIMIT 10
    `);
    
    console.log('ID | User | Permission | Resource | ID | Status | Time');
    recent.forEach(r => {
      console.log(`${r.id} | ${r.user_id} | ${r.permission_name} | ${r.resource_type}:${r.resource_id} | ${r.status} | ${r.requested_at}`);
    });

    // Check consumed status enum
    console.log('\n🔐 Verifying permission_requests.status ENUM values...');
    const [statusEnum] = await db.query(`
      SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'permission_requests' 
      AND COLUMN_NAME = 'status'
    `);
    
    if (statusEnum.length > 0) {
      console.log('Status column type:', statusEnum[0].COLUMN_TYPE);
      if (!statusEnum[0].COLUMN_TYPE.includes('consumed')) {
        console.log('⚠️  WARNING: "consumed" is NOT in the ENUM! Consumption will fail silently.');
      } else {
        console.log('✅ "consumed" status is in ENUM');
      }
    }

    console.log('\n✨ Diagnostic complete!');

  } catch (error) {
    console.error('❌ Diagnostic error:', error.message);
  } finally {
    await db.end();
  }
}

diagnosePermissions();
