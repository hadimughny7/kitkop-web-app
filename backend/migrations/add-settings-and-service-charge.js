const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const Setting = require('../models/Setting');

// Shared by startup and the administrative CLI. Never overwrite configured rates.
const migrate = async () => {
  await Setting.sync();
  const query = sequelize.getQueryInterface();
  const columns = await query.describeTable('orders');
  if (!columns.service_charge) {
    try {
      await query.addColumn('orders', 'service_charge', {
        type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0,
        after: 'tax',
      });
    } catch (error) {
      // Another instance may have added the column after describeTable().
      if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await sequelize.transaction(transaction => Setting.bulkCreate([
    { key: 'tax_percentage', value: '10', description: 'Persentase pajak (%)' },
    { key: 'service_charge_percentage', value: '0', description: 'Persentase service charge (%)' },
  ], { ignoreDuplicates: true, transaction }));
};

module.exports = migrate;
if (require.main === module) {
  migrate().then(() => console.log('Settings migration complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
