const fs = require('fs');
const path = require('path');
const db = require('./config/db');

async function run() {
  try {
    const sqlPath = process.argv[2];
    if (!sqlPath) {
      console.error('Usage: node runMigration_custom_fields_sql.js <path-to-sql>');
      process.exit(1);
    }

    const abs = path.isAbsolute(sqlPath)
      ? sqlPath
      : path.join(process.cwd(), sqlPath);

    const raw = fs.readFileSync(abs, 'utf8');

    // Very light splitting: each CREATE TABLE ... ; should be its own statement.
    // Also remove comments to avoid edge cases.
    const cleaned = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*--.*$/gm, '');

    // Split by semicolon newline; this is good enough for the provided migration.
    const statements = cleaned
      .split(/;\s*\n/g)
      .map(s => s.trim())
      .filter(Boolean);

    console.log('Applying custom fields migration SQL statements:', statements.length);

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      // Skip empty
      if (!stmt) continue;
      // Ignore trailing CREATE DATABASE etc (none here)
      console.log(`\n[${i+1}/${statements.length}] Executing:`, stmt.substring(0, 80).replace(/\s+/g,' ') + '...');
      await db.query(stmt);
    }

    console.log('\n✅ Custom fields tables migration applied successfully.');
    process.exit(0);
  } catch (e) {
    console.error('\n❌ Migration failed:', e.code || '', e.message || e);
    process.exit(1);
  }
}

run();

