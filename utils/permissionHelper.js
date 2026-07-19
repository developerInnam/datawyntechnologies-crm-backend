const db = require('../config/db');

const getResourceType = (permissionName) => {
  if (permissionName.includes('client')) return 'client';
  if (permissionName.includes('followup')) return 'follow_up';
  if (permissionName.includes('note')) return 'note';
  if (permissionName.includes('project')) return 'project';
  return null;
};

const findApprovedPermissionRequest = async ({ userId, permissionName, resourceType, resourceId }) => {
  if (!resourceType || !resourceId) {
    console.warn(`[Permission] Cannot find approval: missing resourceType (${resourceType}) or resourceId (${resourceId})`);
    return null;
  }

  try {
    console.log(`[Permission:findApproved] Query parameters:`);
    console.log(`  user_id: ${userId} (type: ${typeof userId})`);
    console.log(`  permission_name: "${permissionName}"`);
    console.log(`  resource_type: "${resourceType}"`);
    console.log(`  resource_id: ${resourceId} (type: ${typeof resourceId})`);
    
    const [rows] = await db.query(
      `SELECT * FROM permission_requests 
       WHERE user_id = ? 
       AND permission_name = ? 
       AND resource_type = ? 
       AND resource_id = ? 
       AND status = 'approved' 
       LIMIT 1`,
      [userId, permissionName, resourceType, resourceId]
    );

    // DEBUG: show whether resource_id matches type-wise
    console.log(`[Permission DEBUG] looking for permission_requests: user_id=${userId}, permission_name=${permissionName}, resource_type=${resourceType}, resource_id=${resourceId}, status=approved`);

    console.log(`[Permission:findApproved] Query returned ${rows.length} row(s)`);

    if (rows.length > 1) {
      console.warn(`[Permission] ⚠️  SECURITY: Multiple approved permissions found for user ${userId}, ${permissionName} on ${resourceType}:${resourceId}. This should not happen!`);
      // Still return first but this indicates a data integrity issue
      return rows[0];
    }

    if (rows.length > 0) {
      console.log(`[Permission] Found approved request ${rows[0].id} for user ${userId}`);
      return rows[0];
    } else {
      console.log(`[Permission] No approved request found for user ${userId}, permission ${permissionName}, resource ${resourceType}:${resourceId}`);
      return null;
    }
  } catch (err) {
    console.error(`[Permission] Error finding approved request:`, err.message);
    throw err;
  }
};

const consumeApprovedPermissionRequest = async (requestId) => {
  if (!requestId) {
    console.warn('consumeApprovedPermissionRequest called with no requestId');
    return;
  }

  try {
    console.log(`[Permission] Attempting to consume permission request ${requestId}`);
    
    // First verify the request exists and is approved
    const [checkRows] = await db.query(
      `SELECT id, status FROM permission_requests WHERE id = ?`,
      [requestId]
    );

    if (checkRows.length === 0) {
      console.error(`[Permission] Request ${requestId} not found in database!`);
      throw new Error(`Permission request ${requestId} not found`);
    }

    const currentStatus = checkRows[0].status;
    if (currentStatus !== 'approved') {
      console.warn(`[Permission] Request ${requestId} is already ${currentStatus}, cannot consume again`);
      return; // Already consumed, no error
    }

    // Now consume it
    const [result] = await db.query(
      `UPDATE permission_requests SET status = 'consumed', reviewed_at = NOW() WHERE id = ? AND status = 'approved'`,
      [requestId]
    );
    
    if (result.affectedRows === 0) {
      console.error(`[Permission] CRITICAL: Failed to consume request ${requestId} - DB update affected 0 rows`);
      throw new Error(`Failed to mark permission as consumed - database update returned 0 affected rows`);
    }

    if (result.affectedRows === 1) {
      console.log(`[Permission] ✅ Successfully consumed permission request ${requestId}`);
    } else {
      console.warn(`[Permission] Unexpected: consumption affected ${result.affectedRows} rows`);
    }
  } catch (err) {
    console.error(`[Permission] 🔴 CRITICAL ERROR consuming permission ${requestId}:`, err.message);
    throw err; // Propagate so route handler knows consumption failed
  }
};

module.exports = {
  getResourceType,
  findApprovedPermissionRequest,
  consumeApprovedPermissionRequest
};
