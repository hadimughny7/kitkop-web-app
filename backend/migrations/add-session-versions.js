const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const migrate = async () => {
  const query = sequelize.getQueryInterface();
  if ((await query.describeTable('users')).session_version) return;
  try {
    await query.addColumn('users', 'session_version', { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 });
  } catch (error) {
    if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error;
  }
};

module.exports = migrate;
if (require.main === module) {
  migrate().then(() => console.log('Staff session version migration complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
