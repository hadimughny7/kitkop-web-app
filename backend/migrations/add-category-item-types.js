const { DataTypes, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { ITEM_TYPES, legacyCategoryType } = require('../services/categoryTypes');

const audit = async () => {
  const columns = await sequelize.getQueryInterface().describeTable('menu_categories');
  const rows = await sequelize.query(`SELECT id, name, ${columns.item_type ? 'item_type' : 'NULL AS item_type'} FROM menu_categories ORDER BY id`, { type: QueryTypes.SELECT });
  return rows.map(row => ({ ...row, proposed_type: row.item_type || legacyCategoryType(row.name) }));
};
const migrate = async ({ logger = console } = {}) => {
  const query = sequelize.getQueryInterface();
  if (!(await query.describeTable('menu_categories')).item_type) {
    try {
      await query.addColumn('menu_categories', 'item_type', { type: DataTypes.ENUM(...ITEM_TYPES), allowNull: true });
    } catch (error) {
      if (error.original?.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
  await sequelize.transaction(async transaction => {
    const rows = await sequelize.query('SELECT id, name FROM menu_categories WHERE item_type IS NULL', { type: QueryTypes.SELECT, transaction });
    for (const row of rows) {
      const type = legacyCategoryType(row.name);
      if (type) await sequelize.query('UPDATE menu_categories SET item_type = :type WHERE id = :id AND item_type IS NULL', { replacements: { type, id: row.id }, transaction });
    }
  });
  const pending = (await audit()).filter(row => !row.item_type);
  if (pending.length) logger.warn(`Choose an item type in category management for category IDs: ${pending.map(row => row.id).join(', ')}. Orders using these categories are blocked until configured.`);
  return { pending };
};

module.exports = migrate;
module.exports.audit = audit;
if (require.main === module) {
  (process.argv.includes('--audit') ? audit() : migrate())
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
