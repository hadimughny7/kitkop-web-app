const { DataTypes, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { STAFF_ROLES } = require('../constants/roles');

const migrate = async () => {
  const [column] = await sequelize.query(
    "SELECT COLUMN_TYPE AS type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'role'",
    { type: QueryTypes.SELECT },
  );
  if (!column || !column.type.startsWith('enum(')) throw new Error('Expected users.role to be an ENUM column.');
  const existing = [...column.type.matchAll(/'([^']+)'/g)].map(match => match[1]);
  // Append missing values; preserve the order and values of the existing ENUM.
  const missing = STAFF_ROLES.filter(role => !existing.includes(role));
  if (!missing.length) return;
  const definition = (await sequelize.getQueryInterface().describeTable('users')).role;
  await sequelize.getQueryInterface().changeColumn('users', 'role', {
    type: DataTypes.ENUM(...existing, ...missing),
    allowNull: definition.allowNull,
    ...(definition.defaultValue != null ? { defaultValue: definition.defaultValue } : {}),
  });
};

module.exports = migrate;
if (require.main === module) {
  migrate().then(() => console.log('Staff role migration complete.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
