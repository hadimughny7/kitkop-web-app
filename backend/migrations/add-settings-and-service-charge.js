/**
 * Migration: Add settings table and service_charge column to orders
 * 
 * Run this once: node migrations/add-settings-and-service-charge.js
 */
const { sequelize } = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    // 1. Create settings table
    console.log('🔄 Creating settings table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS settings (
        \`key\` VARCHAR(50) NOT NULL PRIMARY KEY,
        value VARCHAR(255) NOT NULL,
        description VARCHAR(255) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✅ settings table created');

    // 2. Insert default settings
    console.log('🔄 Inserting default settings...');
    await sequelize.query(`
      INSERT IGNORE INTO settings (\`key\`, value, description) VALUES 
        ('tax_percentage', '10', 'Persentase pajak (%)'),
        ('service_charge_percentage', '0', 'Persentase service charge (%)')
    `);
    console.log('  ✅ Default settings inserted');

    // 3. Add service_charge column to orders table
    console.log('🔄 Adding service_charge column to orders...');
    try {
      await sequelize.query(`
        ALTER TABLE orders 
        ADD COLUMN service_charge DECIMAL(12, 2) NOT NULL DEFAULT 0
        AFTER tax
      `);
      console.log('  ✅ service_charge column added');
    } catch (err) {
      if (err.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('  ⚠️ service_charge column already exists, skipping');
      } else {
        throw err;
      }
    }

    console.log('\n🎉 Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

migrate();
