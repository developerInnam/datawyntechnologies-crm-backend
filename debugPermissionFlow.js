const db = require('./config/db');
require('dotenv').config();

async function debugPermissionFlow() {
  try {
    console.log('🔍 DETAILED PERMISSION FLOW DEBUG\n');
    console.log('='.repeat(60));

    // Get a user with an approved permission
    console.log('\n1️⃣  Finding test data...');
    const [approvedPermissions] = await db.query(`
      SELECT pr.*, u.name as user_name, u.id as user_id
      FROM permission_requests pr
      LEFT JOIN users u ON pr.user_id = u.id
      WHERE pr.status = 'approved'
      LIMIT 1
    `);

    if (approvedPermissions.length === 0) {
      console.log('❌ No approved permissions found. Cannot test flow.');
      await db.end();
      process.exit(1);
    }

    const permission = approvedPermissions[0];
    console.log(`✅ Found approved permission:`);
    console.log(`   ID: ${permission.id}`);
    console.log(`   User: ${permission.user_name} (ID: ${permission.user_id})`);
    console.log(`   Action: ${permission.permission_name} on ${permission.resource_type}:${permission.resource_id}`);
    console.log(`   Status: ${permission.status}`);

    // Step 2: Simulate permission check (what middleware does)
    console.log('\n2️⃣  Simulating middleware permission check...');
    console.log(`   Query: Find approved ${permission.permission_name} for user ${permission.user_id}`);
    
    const [checkResult] = await db.query(`
      SELECT id, status FROM permission_requests
      WHERE user_id = ?
      AND permission_name = ?
      AND resource_type = ?
      AND resource_id = ?
      AND status = 'approved'
      LIMIT 1
    `, [permission.user_id, permission.permission_name, permission.resource_type, permission.resource_id]);

    if (checkResult.length === 0) {
      console.log('❌ ISSUE FOUND: Middleware would deny this permission!');
      console.log('   Expected to find approved permission but query returned 0 rows');
    } else {
      const found = checkResult[0];
      console.log(`✅ Middleware would ALLOW this (found request ID: ${found.id})`);
      console.log(`   Status: ${found.status}`);
    }

    // Step 3: Simulate permission consumption (what route handler does)
    console.log('\n3️⃣  Simulating consumption process...');
    console.log(`   Consuming permission request ID: ${permission.id}`);

    // First check
    const [preConsumeCheck] = await db.query(
      `SELECT id, status FROM permission_requests WHERE id = ?`,
      [permission.id]
    );

    if (preConsumeCheck.length === 0) {
      console.log('❌ CRITICAL: Permission request not found before consumption!');
    } else {
      console.log(`   Pre-consumption status: ${preConsumeCheck[0].status}`);
    }

    // Try the UPDATE (without actually doing it yet)
    console.log(`   Testing: UPDATE WHERE id = ${permission.id} AND status = 'approved'`);
    
    const [testUpdate] = await db.query(
      `UPDATE permission_requests SET status = 'consumed', reviewed_at = NOW() WHERE id = ? AND status = 'approved'`,
      [permission.id]
    );

    console.log(`   Result: ${testUpdate.affectedRows} rows affected`);
    
    if (testUpdate.affectedRows === 1) {
      console.log('✅ Consumption WOULD succeed');
      
      // Verify the change
      const [postUpdate] = await db.query(
        `SELECT id, status FROM permission_requests WHERE id = ?`,
        [permission.id]
      );
      console.log(`   Post-consumption status: ${postUpdate[0].status}`);

    } else if (testUpdate.affectedRows === 0) {
      console.log('❌ ISSUE FOUND: Consumption UPDATE affected 0 rows!');
      console.log('   This means either:');
      console.log('   - Permission ID not found');
      console.log('   - Status is not "approved"');
      console.log(`   Current actual status in DB: ${preConsumeCheck[0].status}`);
    }

    // Step 4: Simulate second access attempt
    console.log('\n4️⃣  Simulating second access attempt (after consumption)...');
    const [secondCheck] = await db.query(`
      SELECT id, status FROM permission_requests
      WHERE user_id = ?
      AND permission_name = ?
      AND resource_type = ?
      AND resource_id = ?
      AND status = 'approved'
      LIMIT 1
    `, [permission.user_id, permission.permission_name, permission.resource_type, permission.resource_id]);

    if (secondCheck.length === 0) {
      console.log('✅ Second attempt would be DENIED (correct)');
      console.log('   No approved permission found - user would need to request again');
    } else {
      console.log('❌ ISSUE FOUND: Second attempt would still be ALLOWED!');
      console.log(`   Found status: ${secondCheck[0].status}`);
      console.log('   This means permission was NOT properly consumed');
    }

    // Step 5: Full permission flow trace
    console.log('\n5️⃣  Full Flow Summary:');
    console.log('   ┌─────────────────────────────────┐');
    console.log(`   │ Permission ID: ${permission.id}`);
    console.log(`   │ User: ${permission.user_name} (${permission.user_id})`);
    console.log(`   │ Action: ${permission.permission_name}`);
    console.log(`   │ Resource: ${permission.resource_type}:${permission.resource_id}`);
    console.log('   ├─────────────────────────────────┤');
    console.log(`   │ Step 1: Middleware check...`);
    console.log(checkResult.length > 0 ? '   │         ✅ ALLOWED' : '   │         ❌ DENIED');
    console.log(`   │ Step 2: Execute update...`);
    console.log('   │         (simulated, would succeed)');
    console.log(`   │ Step 3: Consume permission...`);
    console.log(testUpdate.affectedRows === 1 ? '   │         ✅ CONSUMED' : '   │         ❌ FAILED');
    console.log(`   │ Step 4: Second attempt...`);
    console.log(secondCheck.length === 0 ? '   │         ✅ DENIED' : '   │         ❌ STILL ALLOWED');
    console.log('   └─────────────────────────────────┘');

    // Step 6: Check for logical issues
    console.log('\n6️⃣  Checking for Logical Issues:');
    
    let issues = [];

    if (checkResult.length === 0) {
      issues.push('❌ Middleware check fails - permission not found');
    }
    
    if (testUpdate.affectedRows === 0) {
      issues.push('❌ Consumption fails - UPDATE affects 0 rows');
    }
    
    if (secondCheck.length > 0) {
      issues.push('❌ Second access still allowed - permission not consumed');
    }

    if (issues.length === 0) {
      console.log('✅ NO ISSUES - Permission flow is working correctly!');
      console.log('   Permissions can be:');
      console.log('   1. Found and allowed by middleware');
      console.log('   2. Successfully consumed after use');
      console.log('   3. Blocked on second access attempt');
    } else {
      console.log(`⚠️  FOUND ${issues.length} ISSUE(S):`);
      issues.forEach((issue, i) => {
        console.log(`   ${i + 1}. ${issue}`);
      });
    }

    console.log('\n' + '='.repeat(60));

  } catch (error) {
    console.error('❌ Debug error:', error.message);
  } finally {
    await db.end();
  }
}

debugPermissionFlow();
