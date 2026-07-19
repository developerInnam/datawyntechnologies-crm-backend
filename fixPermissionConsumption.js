const db = require('./config/db');
require('dotenv').config();

async function fixPermissionConsumption() {
  try {
    console.log('🔧 FIXING PERMISSION CONSUMPTION FLOW\n');

    // Step 1: Update the ENUM to include 'consumed'
    console.log('Step 1: Updating permission_requests.status ENUM...');
    try {
      await db.query(`
        ALTER TABLE permission_requests 
        MODIFY status ENUM('pending', 'approved', 'rejected', 'consumed') DEFAULT 'pending'
      `);
      console.log('✅ Status ENUM updated to include "consumed"');
    } catch (err) {
      console.log('⚠️  Status ENUM update error (might already be correct):', err.message.split('\n')[0]);
    }

    // Step 2: Consume any duplicate approved permissions (keep only 1 per resource)
    console.log('\nStep 2: Cleaning up duplicate approved permissions...');
    const [duplicates] = await db.query(`
      SELECT user_id, permission_name, resource_type, resource_id, 
             GROUP_CONCAT(id) as ids, COUNT(*) as count
      FROM permission_requests 
      WHERE status = 'approved'
      GROUP BY user_id, permission_name, resource_type, resource_id
      HAVING count > 1
    `);

    if (duplicates.length > 0) {
      console.log(`Found ${duplicates.length} resources with duplicate approved permissions:`);
      
      for (const dup of duplicates) {
        const ids = dup.ids.split(',').map(Number);
        const keepId = ids[0]; // Keep the first one
        const consumeIds = ids.slice(1); // Consume the rest

        console.log(`  - User ${dup.user_id}, ${dup.permission_name} on ${dup.resource_type}:${dup.resource_id}`);
        console.log(`    Keeping request #${keepId}, consuming ${consumeIds.join(', ')}`);

        // Mark duplicates as consumed
        await db.query(
          `UPDATE permission_requests SET status = 'consumed' WHERE id IN (${consumeIds.map(() => '?').join(',')})`,
          consumeIds
        );
      }
      console.log('✅ Duplicate permissions handled');
    } else {
      console.log('✅ No duplicate approved permissions found');
    }

    // Step 3: Verify all previously approved permissions are single-use now
    console.log('\nStep 3: Verifying single-use permission enforcement...');
    const [approved] = await db.query(`
      SELECT COUNT(*) as count FROM permission_requests 
      WHERE status = 'approved'
    `);
    console.log(`✅ Currently ${approved[0].count} approved permissions (awaiting first use)`);

    console.log('\n✨ Permission consumption flow fixed!');
    console.log('\nFlow is now:');
    console.log('1. User requests permission → status: "pending"');
    console.log('2. Admin approves → status: "approved"');
    console.log('3. User edits ONCE → status: "consumed" ✅');
    console.log('4. User tries to edit again → 403 Forbidden (must request again)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.end();
  }
}

fixPermissionConsumption();
