const db = require('../config/db');
const { getResourceType, findApprovedPermissionRequest } = require('../utils/permissionHelper');

const checkPermission = (permissionName) => {
  return async (req, res, next) => {
    try {
      const userId = req.user.userId;

      // Check if user can bypass permission checks
      // Admins have all permissions.
      // Executives should also be able to update meeting status.
      // Admin can bypass all permission checks.
      if (req.user.role === 'Admin' || req.user.role_id === 1) {
        console.log(`[Permission] User ${userId} (${req.user.role}) bypassed permission check for ${permissionName}`);
        return next();
      }

      // Executives must NOT bypass resource edit/delete permissions.
      // (Meeting status updates are handled by activities.js route logic.)

      // Allow Executive role to bypass edit_followup permission check
      if (permissionName === 'edit_followup' && (req.user.role === 'Executive' || Number(req.user.role_id) === 2)) {
        console.log(`[Permission] Executive user ${userId} bypassed edit_followup permission check`);
        return next();
      }

      const resourcePermissionNames = new Set([
        'edit_client',
        'delete_client',
        'edit_followup',
        'delete_followup',
        'edit_note',
        'delete_note',
        'edit_project',
        'delete_project'
      ]);

      // For resource-specific edit/delete permissions, do not allow generic role permission bypass for non-admin users.
      if (!resourcePermissionNames.has(permissionName) && req.user.permissions && req.user.permissions.includes(permissionName)) {
        console.log(`[Permission] User ${userId} has role permission for ${permissionName}`);
        return next();
      }

      const resourceType = getResourceType(permissionName);

      // Get resource ID from params or body (for endpoints like custom-fields/values/upsert)
      const resourceId = req.params.id || req.body.resource_id;

      // Check if user has an approved permission request for this specific resource
      if (resourceId && resourceType) {
        console.log(`[Permission] Checking approved permission for user ${userId}: ${permissionName} on ${resourceType} ${resourceId}`);

        const approvedRequest = await findApprovedPermissionRequest({
          userId,
          permissionName,
          resourceType,
          // normalize numeric ids to avoid string/number mismatches
          resourceId: String(resourceId)
        });

        // DEBUG: log raw permission request match outcome
        console.log(`[Permission DEBUG] permissionName=${permissionName} resourceType=${resourceType} resourceId=${resourceId} approvedRequestId=${approvedRequest ? approvedRequest.id : 'null'}`);

        if (approvedRequest) {
          console.log(`[Permission] Found approved request ${approvedRequest.id} for user ${userId}: ${permissionName} on ${resourceType} ${resourceId}`);
          req.approvedPermissionRequestId = approvedRequest.id;
          console.log(`[Permission] ✅ SET req.approvedPermissionRequestId = ${req.approvedPermissionRequestId}`);
          return next();
        }

        // No approved (not yet consumed) permission request exists for this resource.
        // This prevents the same data from being edited multiple times without a fresh request.
        console.log(
          `[Permission] DENIED: No approved request for user ${userId}: ${permissionName} on ${resourceType} ${resourceId}. (If you think you have access, verify permission_requests row exists + status='approved' + resource_id matches exactly.)`
        );

        return res.status(403).json({
          error: `Permission denied: ${permissionName} required`,
          permission: permissionName,
          debug: {
            userId,
            resourceType,
            resourceId,
          },
        });
      }

      // For edit endpoints that are resource-specific (/:id), we deny if no resource approval exists.
      console.log(`[Permission] DENIED: Missing resource ID or type for ${permissionName}`);
      return res.status(403).json({
        error: `Permission denied: ${permissionName} required`,
        permission: permissionName
      });
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: error.message });
    }
  };
};

module.exports = checkPermission;
