const db = require('./config/db');

async function runMigration() {
  try {
    console.log('Starting database migration...');
    
    // Add new columns one by one
    const columns = [
      'project_name VARCHAR(100) NULL AFTER office_location',
      'project_location VARCHAR(200) NULL AFTER project_name',
      "project_status ENUM('ongoing', 'completed', 'upcoming') DEFAULT 'ongoing' AFTER project_location",
      'note TEXT NULL AFTER project_status',
      'services_smm TINYINT(1) DEFAULT 0 AFTER note',
      'services_website TINYINT(1) DEFAULT 0 AFTER services_smm',
      'user_id INT NULL AFTER services_website',
      'type_id INT NULL AFTER user_id',
      'call_status_id INT NULL AFTER type_id',
      "status ENUM('pending', 'completed') DEFAULT 'pending' AFTER call_status_id",
      'follow_up_date DATE NULL AFTER status',
      'remarks TEXT NULL AFTER follow_up_date'
    ];

    for (const column of columns) {
      try {
        console.log(`Adding column: ${column.split(' ')[0]}...`);
        await db.query(`ALTER TABLE clients ADD COLUMN ${column}`);
      } catch (error) {
        if (error.code === 'ER_DUP_FIELDNAME') {
          console.log(`  - Column already exists, skipping...`);
        } else {
          throw error;
        }
      }
    }

    // Drop the assigned_to column (need to drop foreign key first)
    try {
      console.log('Dropping foreign key constraint for assigned_to...');
      await db.query('ALTER TABLE clients DROP FOREIGN KEY clients_ibfk_2');
    } catch (error) {
      console.log('  - Foreign key may not exist or already dropped, continuing...');
    }

    try {
      console.log('Dropping assigned_to column...');
      await db.query('ALTER TABLE clients DROP COLUMN assigned_to');
    } catch (error) {
      if (error.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
        console.log('  - Column already dropped or does not exist, skipping...');
      } else {
        throw error;
      }
    }

    // Add foreign key constraints
    try {
      console.log('Adding foreign key constraints...');
      await db.query('ALTER TABLE clients ADD CONSTRAINT fk_client_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL');
    } catch (error) {
      if (error.code === 'ER_DUP_CONSTRAINT_NAME' || error.code === 'ER_FK_INEXISTING') {
        console.log('  - Foreign key already exists, skipping...');
      } else {
        console.log('  - Warning:', error.message);
      }
    }

    try {
      await db.query('ALTER TABLE clients ADD CONSTRAINT fk_client_type FOREIGN KEY (type_id) REFERENCES activity_types(id) ON DELETE SET NULL');
    } catch (error) {
      if (error.code === 'ER_DUP_CONSTRAINT_NAME' || error.code === 'ER_FK_INEXISTING') {
        console.log('  - Foreign key already exists, skipping...');
      } else {
        console.log('  - Warning:', error.message);
      }
    }

    try {
      await db.query('ALTER TABLE clients ADD CONSTRAINT fk_client_call_status FOREIGN KEY (call_status_id) REFERENCES call_status(id) ON DELETE SET NULL');
    } catch (error) {
      if (error.code === 'ER_DUP_CONSTRAINT_NAME' || error.code === 'ER_FK_INEXISTING') {
        console.log('  - Foreign key already exists, skipping...');
      } else {
        console.log('  - Warning:', error.message);
      }
    }
    
    console.log('✅ Migration completed successfully!');
    console.log('The clients table has been updated with new columns.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
