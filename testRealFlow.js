const db = require('./config/db');
require('dotenv').config();

async function testRealFlowWithLogs() {
  try {
    console.log('🧪 TESTING REAL PERMISSION FLOW WITH DETAILED LOGS\n');
    console.log('='.repeat(70));

    // Find an approved permission
    const [perms] = await db.query(`
      SELECT * FROM permission_requests 
      WHERE status = 'approved'
      LIMIT 1
    `);

    if (perms.length === 0) {
      console.log('❌ No approved permissions. Creating test data...');
      
      // Create a test permission
      const [result] = await db.query(`
        INSERT INTO permission_requests 
        (user_id, permission_name, resource_type, resource_id, action, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [16, 'edit_client', 'client', 999, 'edit', 'approved']);
      
      console.log(`✅ Created test permission ID: ${result.insertId}`);
      perms[0] = { id: result.insertId, user_id: 16, permission_name: 'edit_client', resource_type: 'client', resource_id: 999, status: 'approved' };
    }

    const perm = perms[0];
    console.log(`📝 Using permission: ID=${perm.id}, User=${perm.user_id}, Action=${perm.permission_name}\n`);

    // Simulate FIRST request
    console.log('═══ FIRST REQUEST (Should SUCCEED) ═══');
    console.log(`GET /api/clients/${perm.resource_id}\n`);

    // Step 1: Middleware checks permission
    console.log('1️⃣  MIDDLEWARE: checkPermission("edit_client")\n');
    
    const [middlewareCheck1] = await db.query(`
      SELECT id, status FROM permission_requests
      WHERE user_id = ? AND permission_name = ? 
      AND resource_type = ? AND resource_id = ?
      AND status = 'approved'
    `, [perm.user_id, perm.permission_name, perm.resource_type, perm.resource_id]);

    if (middlewareCheck1.length > 0) {
      console.log(`   ✅ Permission found (ID: ${middlewareCheck1[0].id}, Status: ${middlewareCheck1[0].status})`);
      console.log(`   ✅ req.approvedPermissionRequestId = ${middlewareCheck1[0].id}`);
      const approvedRequestId = middlewareCheck1[0].id;
      
      console.log('\n2️⃣  ROUTE HANDLER: Process PUT request\n');
      console.log(`   ✅ Update client ${perm.resource_id} in database`);
      
      // Simulate update
      const [updateResult] = await db.query('UPDATE clients SET updated_at = NOW() WHERE id = ?', [perm.resource_id]);
      console.log(`   ✅ Update successful (${updateResult.affectedRows} rows affected)`);

      // Step 3: Consume permission
      console.log('\n3️⃣  CONSUMPTION: consumeApprovedPermissionRequest()\n');
      
      // Check status before consumption
      const [beforeConsume] = await db.query('SELECT status FROM permission_requests WHERE id = ?', [approvedRequestId]);
      console.log(`   ℹ️  Before: status = "${beforeConsume[0].status}"`);
      
      // Consume it
      const [consumeResult] = await db.query(
        `UPDATE permission_requests SET status = 'consumed', reviewed_at = NOW() WHERE id = ? AND status = 'approved'`,
        [approvedRequestId]
      );

      if (consumeResult.affectedRows === 1) {
        console.log(`   ✅ Consumption successful (${consumeResult.affectedRows} rows affected)`);
      } else {
        console.log(`   ❌ Consumption FAILED (${consumeResult.affectedRows} rows affected)`);
      }

      // Verify
      const [afterConsume] = await db.query('SELECT status FROM permission_requests WHERE id = ?', [approvedRequestId]);
      console.log(`   ℹ️  After: status = "${afterConsume[0].status}"`);

      console.log('\n4️⃣  RESPONSE: 200 OK - "Client updated successfully"\n');

      // SECOND REQUEST
      console.log('═══ SECOND REQUEST (Should FAIL with 403) ═══');
      console.log(`GET /api/clients/${perm.resource_id} (trying again)\n`);

      console.log('1️⃣  MIDDLEWARE: checkPermission("edit_client")\n');

      const [middlewareCheck2] = await db.query(`
        SELECT id, status FROM permission_requests
        WHERE user_id = ? AND permission_name = ? 
        AND resource_type = ? AND resource_id = ?
        AND status = 'approved'
      `, [perm.user_id, perm.permission_name, perm.resource_type, perm.resource_id]);

      if (middlewareCheck2.length === 0) {
        console.log(`   ❌ No approved permission found`);
        console.log(`   ❌ Middleware returns 403 Forbidden`);
        console.log('\n2️⃣  RESPONSE: 403 FORBIDDEN - "Permission denied"\n');
        
        // Verify what's in the DB
        const [allPerms] = await db.query(`
          SELECT id, status FROM permission_requests
          WHERE user_id = ? AND permission_name = ? 
          AND resource_type = ? AND resource_id = ?
        `, [perm.user_id, perm.permission_name, perm.resource_type, perm.resource_id]);
        
        console.log(`   (Database has ${allPerms.length} matching permission(s):`);
        allPerms.forEach(p => console.log(`    - ID: ${p.id}, Status: ${p.status}`));
        console.log('   )');

      } else {
        console.log(`   ⚠️  PROBLEM FOUND! Permission still found:`);
        console.log(`   ❌ Permission ID: ${middlewareCheck2[0].id}`);
        console.log(`   ❌ Status: "${middlewareCheck2[0].status}" (should be "consumed")`);
        console.log(`   ❌ Middleware would ALLOW this (WRONG!)`);
        console.log('\n   This means the permission was NOT properly consumed');
      }

    } else {
      console.log(`   ❌ Permission NOT found by middleware`);
      console.log(`   ❌ First request would fail with 403`);
    }

    console.log('\n' + '='.repeat(70));

  } catch (error) {
    console.error('❌ Test error:', error);
  } finally {
    await db.end();
  }
}

testRealFlowWithLogs();
