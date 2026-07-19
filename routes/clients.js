const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { consumeApprovedPermissionRequest } = require('../utils/permissionHelper');

// Check client existence (by company_name and/or mobile)
// GET /api/clients/existence-check?company=...&mobile=...
router.get('/existence-check', auth, async (req, res) => {
  try {
    const { company, mobile } = req.query;

    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;
    const where = [];
    const params = [];

    if (!company && !mobile) {
      return res.json({ exists: false, matches: [] });
    }

    // Allow all users to search across all clients for existence check
    // This helps prevent duplicate entries across users

    if (company && mobile) {
      // When both are provided, search in either field (OR logic)
      where.push('(company_name LIKE ? OR mobile LIKE ?)');
      params.push(`%${company}%`, `%${mobile}%`);
    } else if (company) {
      where.push('company_name LIKE ?');
      params.push(`%${company}%`);
    } else if (mobile) {
      where.push('mobile LIKE ?');
      params.push(`%${mobile}%`);
    }

    const whereString = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [matches] = await db.query(
      `SELECT id, client_name, company_name, contact_person, mobile, created_at
       FROM clients
       ${whereString}
       ORDER BY created_at DESC
       LIMIT 5`,
      params
    );

    res.json({
      exists: matches.length > 0,
      matches,
    });
  } catch (error) {
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Get all clients
router.get('/', auth, async (req, res) => {

  try {
    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;
    const searchOthers = req.query.search_others === 'true';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    let query, countQuery, params, countParams;

    if (isAdmin) {
      // Admin: Full access to all fields
      const is_converted_filter = req.query.is_converted;
      const hasConvertedFilter = typeof is_converted_filter !== 'undefined' && is_converted_filter !== '';

      const convertedWhere = hasConvertedFilter ? 'WHERE c.is_converted = ?' : '';

      query = `
        SELECT c.*, i.name as industry_name, 
        at.name as type_name, cs.name as call_status_name,
        u.name as user_name, u.id as user_id
        FROM clients c 
        LEFT JOIN industries i ON c.industry_id = i.id 
        LEFT JOIN activity_types at ON c.type_id = at.id
        LEFT JOIN call_status cs ON c.call_status_id = cs.id
        LEFT JOIN users u ON c.user_id = u.id
        ${convertedWhere}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `;

      countQuery = hasConvertedFilter
        ? 'SELECT COUNT(*) as total FROM clients c WHERE c.is_converted = ?'
        : 'SELECT COUNT(*) as total FROM clients';
      params = hasConvertedFilter ? [is_converted_filter, limit, offset] : [limit, offset];
    } else if (searchOthers) {
      // Search across all clients added by all users with a single search term
      const searchTerm = req.query.search;
      const is_converted_filter = req.query.is_converted;
      const hasConvertedFilter = typeof is_converted_filter !== 'undefined' && is_converted_filter !== '';

      if (searchTerm) {
        const likeTerm = `%${searchTerm}%`;
        const convertedAnd = hasConvertedFilter ? ' AND c.is_converted = ?' : '';

        if (isAdmin) {
          // Admin: Full access to all fields, search across multiple fields
          query = `
            SELECT c.*, i.name as industry_name, at.name as type_name, cs.name as call_status_name, u.name as user_name
            FROM clients c
            LEFT JOIN industries i ON c.industry_id = i.id
            LEFT JOIN activity_types at ON c.type_id = at.id
            LEFT JOIN call_status cs ON c.call_status_id = cs.id
            LEFT JOIN users u ON c.user_id = u.id
            WHERE (c.client_name LIKE ? 
               OR c.company_name LIKE ? 
               OR c.contact_person LIKE ? 
               OR c.mobile LIKE ? 
               OR c.email LIKE ? 
               OR c.office_location LIKE ? 
               OR c.project_location LIKE ? 
               OR c.project_status LIKE ? 
               OR c.status LIKE ? 
               OR c.remarks LIKE ?)${convertedAnd}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
          `;
          params = [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm];
          if (hasConvertedFilter) params.push(is_converted_filter);
          params.push(limit, offset);

          countQuery = `
            SELECT COUNT(*) as total FROM clients c
            WHERE (c.client_name LIKE ? 
               OR c.company_name LIKE ? 
               OR c.contact_person LIKE ? 
               OR c.mobile LIKE ? 
               OR c.email LIKE ? 
               OR c.office_location LIKE ? 
               OR c.project_location LIKE ? 
               OR c.project_status LIKE ? 
               OR c.status LIKE ? 
               OR c.remarks LIKE ?)${convertedAnd}
          `;
          countParams = [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm];
          if (hasConvertedFilter) countParams.push(is_converted_filter);
        } else {
          // Non-admin: Return simplified results (only company_name and user_name) when searching other users' clients
          query = `
            SELECT 
              c.id,
              c.company_name,
              u.name as user_name
            FROM clients c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE (c.client_name LIKE ? 
               OR c.company_name LIKE ? 
               OR c.contact_person LIKE ? 
               OR c.mobile LIKE ? 
               OR c.email LIKE ? 
               OR c.office_location LIKE ? 
               OR c.project_location LIKE ? 
               OR c.project_status LIKE ? 
               OR c.status LIKE ? 
               OR c.remarks LIKE ?)
              ${hasConvertedFilter ? 'AND c.is_converted = ?' : ''}
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
          `;
          params = [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm];
          if (hasConvertedFilter) params.push(is_converted_filter);
          params.push(limit, offset);
          countQuery = `
            SELECT COUNT(*) as total FROM clients c
            WHERE (c.client_name LIKE ? 
               OR c.company_name LIKE ? 
               OR c.contact_person LIKE ? 
               OR c.mobile LIKE ? 
               OR c.email LIKE ? 
               OR c.office_location LIKE ? 
               OR c.project_location LIKE ? 
               OR c.project_status LIKE ? 
               OR c.status LIKE ? 
               OR c.remarks LIKE ?)${convertedAnd}
          `;
          countParams = [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm];
          if (hasConvertedFilter) countParams.push(is_converted_filter);
        }
      } else {
        // No search term: return simplified results for non-admin users when searching others
        const is_converted_filter = req.query.is_converted;
        const hasConvertedFilter = typeof is_converted_filter !== 'undefined' && is_converted_filter !== '';

        const convertedWhere = hasConvertedFilter ? 'WHERE c.is_converted = ?' : '';

        query = `
          SELECT
            c.id,
            c.company_name,
            u.name as user_name
          FROM clients c
          LEFT JOIN users u ON c.user_id = u.id
          ${convertedWhere}
          ORDER BY c.created_at DESC
          LIMIT ? OFFSET ?
        `;
        countQuery = hasConvertedFilter
          ? 'SELECT COUNT(*) as total FROM clients c WHERE c.is_converted = ?'
          : 'SELECT COUNT(*) as total FROM clients';
        params = hasConvertedFilter ? [is_converted_filter, limit, offset] : [limit, offset];
        countParams = hasConvertedFilter ? [is_converted_filter] : [];
      }
    } else {
      // Non-admin: Full access to own clients only
      const is_converted_filter = req.query.is_converted;
      const hasConvertedFilter = typeof is_converted_filter !== 'undefined' && is_converted_filter !== '';

      const convertedWhere = hasConvertedFilter ? 'AND c.is_converted = ?' : '';

      query = `
        SELECT c.*, i.name as industry_name,
        at.name as type_name, cs.name as call_status_name,
        u.name as user_name, u.id as user_id,
        1 as is_owner
        FROM clients c
        LEFT JOIN industries i ON c.industry_id = i.id
        LEFT JOIN activity_types at ON c.type_id = at.id
        LEFT JOIN call_status cs ON c.call_status_id = cs.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.user_id = ? ${convertedWhere}
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
      `;
      countQuery = hasConvertedFilter
        ? 'SELECT COUNT(*) as total FROM clients WHERE user_id = ? AND is_converted = ?'
        : 'SELECT COUNT(*) as total FROM clients WHERE user_id = ?';
      params = hasConvertedFilter ? [req.user.userId, is_converted_filter, limit, offset] : [req.user.userId, limit, offset];
    }

    const [rows] = await db.query(query, params);
    // determine count query params: prefer explicit countParams when set
    let countQueryParams = [];
    if (typeof countParams !== 'undefined') {
      countQueryParams = countParams;
    } else if (isAdmin) {
      const is_converted_filter = req.query.is_converted;
      const hasConvertedFilter = typeof is_converted_filter !== 'undefined' && is_converted_filter !== '';
      countQueryParams = hasConvertedFilter ? [is_converted_filter] : [];
    } else if (!searchOthers && !isAdmin) {
      const is_converted_filter = req.query.is_converted;
      const hasConvertedFilter = typeof is_converted_filter !== 'undefined' && is_converted_filter !== '';
      countQueryParams = hasConvertedFilter ? [req.user.userId, is_converted_filter] : [req.user.userId];
    }
    const [countResult] = await db.query(countQuery, countQueryParams);
    const total = countResult[0].total;

    res.json({
      data: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get client by id
router.get('/:id', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'Admin' || req.user.role_id === 1;
    
    // Check if client exists
    const [clientCheck] = await db.query('SELECT user_id FROM clients WHERE id = ?', [req.params.id]);
    if (clientCheck.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const isOwner = clientCheck[0].user_id === req.user.userId;

    // Check if user has approved permission for this specific client
    let hasApprovedPermission = false;
    if (!isAdmin && !isOwner) {
      const [permissionCheck] = await db.query(`
        SELECT * FROM permission_requests 
        WHERE permission_name = 'edit_client' 
        AND resource_type = 'client' 
        AND resource_id = ? 
        AND user_id = ? 
        AND status = 'approved'
      `, [req.params.id, req.user.userId]);
      hasApprovedPermission = permissionCheck.length > 0;
    }

    if (isAdmin || isOwner || hasApprovedPermission) {
      // Admin, owner, or user with approved permission: Full access
      const [rows] = await db.query(`
        SELECT c.*, i.name as industry_name, 
        at.name as type_name, cs.name as call_status_name,
        u.name as user_name, u.id as user_id
        FROM clients c 
        LEFT JOIN industries i ON c.industry_id = i.id 
        LEFT JOIN activity_types at ON c.type_id = at.id
        LEFT JOIN call_status cs ON c.call_status_id = cs.id
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `, [req.params.id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      const client = rows[0];

      if (client && (isAdmin || isOwner || hasApprovedPermission)) {
        const [vals] = await db.query(
          'SELECT field_key, value_text FROM custom_field_values WHERE resource_type = ? AND resource_id = ?',
          ['client', client.id]
        );

        // Return as array of objects
        // [{ field_key, value }]
        client.custom_field_values = vals.map((v) => ({
          field_key: v.field_key,
          value: v.value_text,
        }));

        // Fetch services for this client
        const [services] = await db.query(`
          SELECT s.id, s.name, s.description
          FROM services s
          INNER JOIN client_services cs ON s.id = cs.service_id
          WHERE cs.client_id = ?
        `, [client.id]);
        client.services = services;
      }


      res.json(client);
    } else {
      // Non-owner without approved permission: Limited access
      const [rows] = await db.query(`
        SELECT 
          c.id,
          c.company_name,
          u.name as user_name,
          u.id as user_id
        FROM clients c 
        LEFT JOIN users u ON c.user_id = u.id
        WHERE c.id = ?
      `, [req.params.id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      res.json(rows[0]);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create client
router.post('/', auth, async (req, res) => {
  try {
    console.log('Received request body:', JSON.stringify(req.body, null, 2));
    
    const { 
      client_name, company_name, contact_person, mobile, 
      email, website, industry_id, office_location, 
      project_name, project_location, project_status, service_ids,
      type_id, call_status_id, status, follow_up_date, remarks, client_notes,
      custom_field_values,
    } = req.body;


    const clientName = client_name || company_name;

    // Check if IDs are empty strings and convert to NULL
    const industryVal = industry_id === "" ? null : industry_id;
    const typeVal = type_id === "" ? null : type_id;
    const callStatusVal = call_status_id === "" ? null : call_status_id;

    console.log('Processed values:', {
      clientName, industryVal, typeVal, callStatusVal, service_ids, project_status
    });

    const query = `
      INSERT INTO clients 
      (client_name, company_name, contact_person, mobile, email, website, industry_id, office_location,
       project_name, project_location, project_status,
       user_id, type_id, call_status_id, status, follow_up_date, remarks) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await db.query(query, [
      clientName, 
      company_name || null, 
      contact_person || null, 
      mobile || null, 
      email || null, 
      website || null, 
      industryVal, 
      office_location || null,
      project_name || null,
      project_location || null,
      project_status || 'ongoing',
      req.user.userId,
      typeVal,
      callStatusVal,
      status || 'pending',
      follow_up_date || null,
      remarks || null
    ]);

    // Insert services into client_services junction table
    console.log('service_ids:', service_ids);
    if (service_ids && Array.isArray(service_ids) && service_ids.length > 0) {
      const serviceValues = service_ids.map(serviceId => [result.insertId, serviceId]);
      const placeholders = serviceValues.map(() => '(?, ?)').join(',');
      const flat = serviceValues.flat();
      
      console.log('Inserting services:', placeholders, flat);
      await db.query(
        `INSERT INTO client_services (client_id, service_id) VALUES ${placeholders}`,
        flat
      );
      console.log('Services inserted successfully');
    } else {
      console.log('No services to insert or invalid service_ids');
    }

    // Save note to notes table if provided
    if (client_notes && client_notes.trim()) {
      await db.query(
        'INSERT INTO notes (client_id, user_id, note) VALUES (?, ?, ?)',
        [result.insertId, req.user.userId, client_notes]
      );
    }

    // Upsert custom field values (dynamic fields)
    if (custom_field_values && typeof custom_field_values === 'object') {
      const values = custom_field_values || {};
      const keys = Object.keys(values);

      if (keys.length > 0) {
        const connectionValues = keys.map((field_key) => [
          'client',
          result.insertId,
          field_key,
          values[field_key] === undefined || values[field_key] === null
            ? null
            : String(values[field_key]),
        ]);

        const placeholders = connectionValues.map(() => '(?, ?, ?, ?)').join(',');
        const flat = connectionValues.flat();

        await db.query(
          `INSERT INTO custom_field_values (resource_type, resource_id, field_key, value_text)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             value_text = VALUES(value_text),
             updated_at = CURRENT_TIMESTAMP`,
          flat
        );
      }
    }

    res.status(201).json({ id: result.insertId });
  } catch (error) {
    console.error('SERVER CRASH ERROR:', error); 
    console.error('Error details:', error.code, error.sqlMessage);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Update client
router.put('/:id', auth, checkPermission('edit_client'), async (req, res) => {
  try {
    console.log(`\n[Route:PUT] /clients/${req.params.id}`);
    console.log(`[Route:PUT] req.approvedPermissionRequestId = ${req.approvedPermissionRequestId}`);
    
    // Verify client exists
    const [clientCheck] = await db.query('SELECT user_id FROM clients WHERE id = ?', [req.params.id]);
    if (clientCheck.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const { client_name, company_name, contact_person, mobile, email, website, industry_id, office_location,
      project_name, project_location, project_status, service_ids,
      type_id, call_status_id, status, follow_up_date, remarks, client_notes,
      custom_field_values } = req.body;

    const clientName = client_name || company_name;

    // Check if IDs are empty strings and convert to NULL
    const industryVal = industry_id === "" ? null : industry_id;
    const typeVal = type_id === "" ? null : type_id;
    const callStatusVal = call_status_id === "" ? null : call_status_id;

    await db.query(
      'UPDATE clients SET client_name = ?, company_name = ?, contact_person = ?, mobile = ?, email = ?, website = ?, industry_id = ?, office_location = ?, project_name = ?, project_location = ?, project_status = ?, type_id = ?, call_status_id = ?, status = ?, follow_up_date = ?, remarks = ? WHERE id = ?',
      [clientName, company_name || null, contact_person || null, mobile || null, email || null, website || null, industryVal, office_location || null, project_name || null, project_location || null, project_status || 'ongoing', typeVal, callStatusVal, status || 'pending', follow_up_date || null, remarks || null, req.params.id]
    );

    // Update services in client_services junction table
    // First, delete existing services for this client
    await db.query('DELETE FROM client_services WHERE client_id = ?', [req.params.id]);
    
    // Then, insert new services if provided
    if (service_ids && Array.isArray(service_ids) && service_ids.length > 0) {
      const serviceValues = service_ids.map(serviceId => [req.params.id, serviceId]);
      const placeholders = serviceValues.map(() => '(?, ?)').join(',');
      const flat = serviceValues.flat();
      
      await db.query(
        `INSERT INTO client_services (client_id, service_id) VALUES ${placeholders}`,
        flat
      );
    }

    // Save note to notes table if provided
    if (client_notes && client_notes.trim()) {
      await db.query(
        'INSERT INTO notes (client_id, user_id, note) VALUES (?, ?, ?)',
        [req.params.id, req.user.userId, client_notes]
      );
    }

    // Upsert custom field values (dynamic fields)
    if (custom_field_values && typeof custom_field_values === 'object') {
      const values = custom_field_values || {};
      const keys = Object.keys(values);

      if (keys.length > 0) {
        const connectionValues = keys.map((field_key) => [
          'client',
          req.params.id,
          field_key,
          values[field_key] === undefined || values[field_key] === null
            ? null
            : String(values[field_key]),
        ]);

        const placeholders = connectionValues.map(() => '(?, ?, ?, ?)').join(',');
        const flat = connectionValues.flat();

        await db.query(
          `INSERT INTO custom_field_values (resource_type, resource_id, field_key, value_text)
           VALUES ${placeholders}
           ON DUPLICATE KEY UPDATE
             value_text = VALUES(value_text),
             updated_at = CURRENT_TIMESTAMP`,
          flat
        );
      }
    }

    // IMPORTANT: single-use enforcement
    // Consume the approved permission request BEFORE we commit the update.
    // If it's already consumed, block the update.
    // (This prevents multiple updates using the same approved request.)
    if (req.approvedPermissionRequestId) {

      try { 

        console.log(`[Route:PUT] ✅ Consuming permission ID (single-use): ${req.approvedPermissionRequestId}`);
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
        console.log(`[Route:PUT] ✅ Consumption completed (single-use)`);
      } catch (consumeErr) {
        console.error(`[Route:PUT] ❌ Consumption error (single-use):`, consumeErr.message);
        return res.status(403).json({
          error: 'This permission was already used. Please request permission again.'
        });
      }
    } else {
      // Admin/Executive bypass path: do not consume (they can always edit).
      console.log(`[Route:PUT] ℹ️  No approvedPermissionRequestId provided; skipping consumption (admin/executive bypass path).`);
    }

    // Consume permission must happen before update; if we got here for non-admin users,
    // permission has been consumed. Proceed to commit changes.
    console.log(`[Route:PUT] Update successful for client ${req.params.id}`);

    res.json({ message: 'Client updated successfully' });
  } catch (error) {
    console.error('Update client error:', error);
    res.status(500).json({ error: error.sqlMessage || error.message });
  }
});

// Delete client
router.delete('/:id', auth, checkPermission('delete_client'), async (req, res) => {
  try {
    // Verify client exists
    const [clientCheck] = await db.query('SELECT id FROM clients WHERE id = ?', [req.params.id]);
    if (clientCheck.length === 0) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await db.query('DELETE FROM clients WHERE id = ?', [req.params.id]);

    // Consume permission AFTER successful delete
    if (req.approvedPermissionRequestId) {
      try {
        console.log(`[Route] Consuming permission for delete_client on client ${req.params.id}`);
        await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
      } catch (consumeErr) {
        console.error(`[Route] Failed to consume permission:`, consumeErr);
        // Still return success but log the consumption failure
      }
    }

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update client converted status
router.patch('/:id/converted', auth, async (req, res) => {
  try {
    const { is_converted } = req.body;
    
    // Check authorization: Admin/Executive can update all clients, others can only update their own
    const isAdminOrExecutive = req.user.role === 'Admin' || req.user.role_id === 1 || req.user.role === 'Executive' || req.user.role_id === 2;
    
    if (!isAdminOrExecutive) {
      const [clientCheck] = await db.query('SELECT user_id FROM clients WHERE id = ?', [req.params.id]);
      if (clientCheck.length === 0) {
        return res.status(404).json({ error: 'Client not found' });
      }
      if (clientCheck[0].user_id !== req.user.userId) {
        return res.status(403).json({ error: 'You can only update your own clients' });
      }
    }

    await db.query('UPDATE clients SET is_converted = ? WHERE id = ?', [is_converted ? 1 : 0, req.params.id]);
    res.json({ message: 'Client converted status updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
