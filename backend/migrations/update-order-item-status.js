/**
 * Migration: Update order_items status ENUM and add completed_at column
 * 
 * Run this once: node migrations/update-order-item-status.js
 */
const { sequelize } = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database');

    // MySQL requires recreating the column for ENUM changes
    console.log('🔄 Updating status ENUM...');
    
    await sequelize.query(`UPDATE order_items SET status = 'pending' WHERE status = 'active'`);
    console.log('  ✅ Updated existing "active" items to "pending"');

    await sequelize.query(`
      ALTER TABLE order_items 
      MODIFY COLUMN status ENUM('pending', 'preparing', 'completed', 'rejected') 
      DEFAULT 'pending'
    `);
    console.log('  ✅ Status ENUM updated');

    console.log('🔄 Adding completed_at column...');
    try {
      await sequelize.query(`
        ALTER TABLE order_items 
        ADD COLUMN completed_at DATETIME NULL DEFAULT NULL
      `);
      console.log('  ✅ completed_at column added');
    } catch (err) {
      if (err.original?.code === 'ER_DUP_FIELDNAME') {
        console.log('  ⚠️ completed_at column already exists, skipping');
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
