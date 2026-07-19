const express = require('express');
const router = express.Router();
const db = require('../config/db');
const auth = require('../middleware/auth');
const checkPermission = require('../middleware/checkPermission');
const { consumeApprovedPermissionRequest } = require('../utils/permissionHelper');

// Supported UI field types (builder + renderer)
const isValidFieldType = (t) =>
  [
    'text',
    'textarea',
    'number',
    'email',
    'phone',
    'date',
    'time',
    'datetime',
    'dropdown',
    'multi_select',
    'radio',
    'checkbox',
    'file_upload',
    'url',
  ].includes(t);


const normalizeOptions = (field_type, options) => {
  // Frontend uses: select -> dropdown, radio -> radio, checkbox -> checkbox
  // Backend stores options_json for dropdown + radio + checkbox.
  // Keep this function strict and always return a JSON-serializable array
  // for supported field types.
  if (field_type !== 'dropdown' && field_type !== 'radio' && field_type !== 'select' && field_type !== 'checkbox') return [];
  if (!Array.isArray(options)) return [];

  // store as [{id,label}...] - frontend uses {id,label}
  return options
    .map((o) => {
      if (o && typeof o === 'object') {
        return { id: o.id ?? null, label: o.label ?? '' };
      }
      if (typeof o === 'string') return { id: null, label: o };
      return null;
    })
    .filter(Boolean);
};



// NOTE: We keep permission checks simple here.
// If you have a dedicated permission like `manage_custom_fields`, add it.
// For now: Admin only.
const requireAdmin = [auth, (req, res, next) => {
  const isAdmin = req.user?.role === 'Admin' || req.user?.role_id === 1;
  if (!isAdmin) return res.status(403).json({ error: 'Admin only' });
  next();
}];

// Get custom field definitions for a resource + page
// GET /custom-fields?resource_type=client&page_key=clients/add
router.get('/', auth, async (req, res) => {
  try {
    const resource_type = req.query.resource_type;
    const page_key = req.query.page_key;

    if (!resource_type || !page_key) {
      return res.status(400).json({ error: 'resource_type and page_key are required' });
    }

    const [rows] = await db.query(
      `SELECT id, resource_type, page_key, card_title, label, field_key, field_type, required, helper_text, options_json
       FROM custom_field_definitions
       WHERE resource_type = ? AND page_key = ?
       ORDER BY id ASC`,
      [resource_type, page_key]
    );

    const safeParseOptions = (options_json) => {
      if (!options_json) return [];
      try {
        const parsed = JSON.parse(options_json);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        // If a legacy row has invalid JSON, don't crash the whole route.
        return [];
      }
    };

    res.json(
      rows.map((r) => ({
        ...r,
        options: safeParseOptions(r.options_json),
        // frontend expects options array separate from options_json
        options_json: undefined,
      }))
    );

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create custom field definition
// POST /custom-fields
// body: {resource_type,page_key,label,field_key,field_type,required,helper_text,options}
router.post('/', ...requireAdmin, async (req, res) => {
  try {
    const {
      resource_type,
      page_key,
      card_title,
      label,
      field_key,
      field_type,
      required,
      helper_text,
      options,
    } = req.body;

    if (!resource_type || !page_key) return res.status(400).json({ error: 'resource_type and page_key are required' });
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'label is required' });
    if (!field_key || !String(field_key).trim()) return res.status(400).json({ error: 'field_key is required' });
    if (!field_type || !isValidFieldType(field_type)) return res.status(400).json({ error: 'Invalid field_type' });

    const options_json = normalizeOptions(field_type, options);
    const options_json_str = JSON.stringify(options_json);

    const helper_text_str =
      helper_text === undefined || helper_text === null
        ? null
        : String(helper_text);

    // Upsert by unique key to simplify UX
    const [result] = await db.query(
      `INSERT INTO custom_field_definitions
        (resource_type,page_key,card_title,label,field_key,field_type,required,helper_text,options_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         card_title = VALUES(card_title),
         label = VALUES(label),
         field_type = VALUES(field_type),
         required = VALUES(required),
         helper_text = VALUES(helper_text),
         options_json = VALUES(options_json),
         updated_at = CURRENT_TIMESTAMP`,
      [
        resource_type,
        page_key,
        card_title || null,
        label,
        field_key,
        field_type,
        required ? 1 : 0,
        helper_text_str,
        options_json_str,
      ]
    );

    res.status(201).json({ message: 'Custom field definition saved', result });
  } catch (error) {
    // Provide detailed server-side diagnostics (the client only gets a safe message)
    // so we can identify the exact constraint / SQL issue causing 500.
    console.error('\n[POST /custom-fields] Failed:');
    console.error('Body:', req.body);
    console.error('Error message:', error?.message);
    console.error('Error code:', error?.code);
    console.error('SQL:', error?.sql);
    console.error('SQLState:', error?.sqlState);
    console.error('Errno:', error?.errno);
    res.status(500).json({
      error: error?.message || 'Internal Server Error',
      debug: {
        code: error?.code,
        sql: error?.sql,
        sqlState: error?.sqlState,
        errno: error?.errno,
      },
    });
  }
});



// Update definition by id
router.put('/:id', ...requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const {
      card_title,
      label,
      field_key,
      field_type,
      required,
      helper_text,
      options,
      // page_key/resource_type intentionally not required; allowing update if provided
      resource_type,
      page_key,
    } = req.body;

    const existing = await db.query(
      'SELECT * FROM custom_field_definitions WHERE id = ?',
      [id]
    );

    const [rows] = existing;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const current = rows[0];

    const next = {
      resource_type: resource_type ?? current.resource_type,
      page_key: page_key ?? current.page_key,
      card_title: card_title ?? current.card_title,
      label: label ?? current.label,
      field_key: field_key ?? current.field_key,
      field_type: field_type ?? current.field_type,
      required: required ?? current.required,
      helper_text: helper_text ?? current.helper_text,
      options_json: JSON.stringify(normalizeOptions(field_type ?? current.field_type, options ?? (current.options_json ? JSON.parse(current.options_json) : []))),
    };

    if (!isValidFieldType(next.field_type)) return res.status(400).json({ error: 'Invalid field_type' });

    await db.query(
      `UPDATE custom_field_definitions
       SET resource_type = ?, page_key = ?, card_title = ?, label = ?, field_key = ?, field_type = ?,
           required = ?, helper_text = ?, options_json = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        next.resource_type,
        next.page_key,
        next.card_title || null,
        next.label,
        next.field_key,
        next.field_type,
        next.required ? 1 : 0,
        next.helper_text || null,
        next.options_json,
        id,
      ]
    );

    res.json({ message: 'Custom field definition updated' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete definition
router.delete('/:id', ...requireAdmin, async (req, res) => {
  try {
    await db.query('DELETE FROM custom_field_definitions WHERE id = ?', [req.params.id]);
    res.json({ message: 'Custom field definition deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upsert custom field values for a given resource
// POST /custom-fields/values/upsert
// body: {resource_type, resource_id, values: { [field_key]: value } }
router.post('/values/upsert', auth, checkPermission('edit_client'), async (req, res) => {
  try {
    const { resource_type, resource_id, values } = req.body;
    if (!resource_type) return res.status(400).json({ error: 'resource_type required' });
    if (!resource_id) return res.status(400).json({ error: 'resource_id required' });
    if (!values || typeof values !== 'object') return res.status(400).json({ error: 'values object required' });

    const keys = Object.keys(values);
    if (keys.length === 0) return res.json({ message: 'No values to upsert' });

    const connectionValues = keys.map((field_key) => [
      resource_type,
      resource_id,
      field_key,
      values[field_key] === undefined || values[field_key] === null ? null : String(values[field_key]),
    ]);

    // Build bulk upsert
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

    // Consume permission AFTER successful upsert (only for non-admin users)
    if (req.user.role !== 'Admin' && req.user.role_id !== 1) {
      if (req.approvedPermissionRequestId) {
        try {
          console.log(`[Route] Consuming permission for edit_client on custom fields for resource ${resource_id}`);
          await consumeApprovedPermissionRequest(req.approvedPermissionRequestId);
        } catch (consumeErr) {
          console.error(`[Route] Failed to consume permission:`, consumeErr);
          return res.status(500).json({
            error: 'Permission consumption failed. Please request permission again.'
          });
        }
      } else {
        return res.status(403).json({
          error: 'Permission denied: missing approved permission id'
        });
      }
    }

    res.json({ message: 'Custom field values upserted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get custom field values for a given resource_id
// GET /custom-fields/values?resource_type=client&resource_id=123
router.get('/values', auth, async (req, res) => {
  try {
    const { resource_type, resource_id } = req.query;
    if (!resource_type || !resource_id) return res.status(400).json({ error: 'resource_type and resource_id are required' });

    const [rows] = await db.query(
      'SELECT field_key, value_text FROM custom_field_values WHERE resource_type = ? AND resource_id = ?',
      [resource_type, resource_id]
    );

    // Return as array of objects for frontend consumption
    // [{ field_key, value }]
    const values = rows.map(r => ({
      field_key: r.field_key,
      value: r.value_text,
    }));
    res.json(values);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

