const db = require('./config/db');
require('dotenv').config();

async function analyzeMultiplePermissions() {
  try {
    console.log('🔍 ANALYZING PERMISSION DUPLICATION ISSUE\n');
    console.log('='.repeat(70));

    // Find resources with multiple APPROVED permissions
    console.log('\n1️⃣  Checking for DUPLICATE APPROVED permissions:\n');

    const [duplicates] = await db.query(`
      SELECT 
        user_id, 
        permission_name, 
        resource_type, 
        resource_id, 
        COUNT(*) as count,
        GROUP_CONCAT(id ORDER BY id) as ids,
        GROUP_CONCAT(status ORDER BY id) as statuses
      FROM permission_requests
      WHERE status = 'approved'
      GROUP BY user_id, permission_name, resource_type, resource_id
      HAVING count > 1
      ORDER BY count DESC
    `);

    if (duplicates.length > 0) {
      console.log(`⚠️  FOUND ${duplicates.length} RESOURCES WITH DUPLICATE APPROVED PERMISSIONS:\n`);
      duplicates.forEach((dup, idx) => {
        console.log(`${idx + 1}. User ${dup.user_id}: ${dup.permission_name} on ${dup.resource_type}:${dup.resource_id}`);
        console.log(`   - Count: ${dup.count} approved permissions`);
        console.log(`   - IDs: ${dup.ids.split(',').join(', ')}`);
        console.log(`   - Statuses: ${dup.statuses}`);
        console.log('   ⚠️  THIS IS THE PROBLEM! Multiple approved = can edit multiple times!\n');
      });
    } else {
      console.log('✅ No duplicate approved permissions found\n');
    }

    // Find the most common permission patterns
    console.log('2️⃣  Permission breakdown by status:\n');
    const [breakdown] = await db.query(`
      SELECT 
        status, 
        COUNT(*) as count
      FROM permission_requests
      GROUP BY status
      ORDER BY count DESC
    `);

    breakdown.forEach(row => {
      console.log(`   ${row.status}: ${row.count}`);
    });

    // Find all approved permissions
    console.log('\n3️⃣  All APPROVED permissions (can edit right now):\n');
    const [allApproved] = await db.query(`
      SELECT 
        id,
        user_id,
        permission_name,
        resource_type,
        resource_id,
        requested_at
      FROM permission_requests
      WHERE status = 'approved'
      ORDER BY user_id, resource_type, resource_id
      LIMIT 20
    `);

    if (allApproved.length === 0) {
      console.log('   (No approved permissions)');
    } else {
      console.log(`   (Showing ${allApproved.length} of ${allApproved.length}):\n`);
      allApproved.forEach(perm => {
        console.log(`   ID: ${perm.id.toString().padStart(3)}  |  User: ${perm.user_id.toString().padStart(2)}  |  ${perm.permission_name.padEnd(15)}  |  ${perm.resource_type.padEnd(10)}:${perm.resource_id}`);
      });
    }

    // Check if there's a pattern of requests being created instead of consumed
    console.log('\n4️⃣  Permission request frequency analysis:\n');
    const [frequency] = await db.query(`
      SELECT 
        DATE(requested_at) as date,
        permission_name,
        COUNT(*) as total_requests,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'consumed' THEN 1 ELSE 0 END) as consumed_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
      FROM permission_requests
      GROUP BY DATE(requested_at), permission_name
      ORDER BY date DESC, permission_name
      LIMIT 10
    `);

    console.log('Date       | Permission  | Total | Approved | Consumed | Pending | Rejected');
    console.log('-----------|-------------|-------|----------|----------|---------|----------');
    frequency.forEach(row => {
      console.log(`${row.date} | ${row.permission_name.padEnd(11)} | ${row.total_requests.toString().padStart(5)} | ${row.approved_count.toString().padStart(8)} | ${row.consumed_count.toString().padStart(8)} | ${row.pending_count.toString().padStart(7)} | ${row.rejected_count.toString().padStart(8)}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('\n💡 DIAGNOSIS:\n');

    if (duplicates.length > 0) {
      console.log('❌ ISSUE CONFIRMED: Multiple approved permissions exist!');
      console.log('   When user tries to edit, middleware finds the FIRST approved one.');
      console.log('   After consumption, middleware finds the NEXT approved one.');
      console.log('   Result: User can edit N times (where N = number of approved permissions)\n');
      console.log('✅ FIX:');
      console.log('   1. Consume ALL approved permissions when action succeeds');
      console.log('   2. OR: Prevent creating duplicate approved permissions');
      console.log('   3. OR: Only allow ONE approved per (user, permission, resource)');
    } else {
      console.log('✅ No duplicate approved permissions found.');
      console.log('   The permission system should be working correctly.');
      console.log('   If user still can edit multiple times, check:');
      console.log('   - Server logs for consumption errors');
      console.log('   - Frontend caching issues');
      console.log('   - Database transaction issues');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await db.end();
  }
}

analyzeMultiplePermissions();
