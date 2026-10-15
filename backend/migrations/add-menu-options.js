const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');
const { OptionGroup, MenuOptionGroup, OptionTemplate } = require('../models');

async function migrate() {
  await OptionGroup.sync();
  await MenuOptionGroup.sync();
  await OptionTemplate.sync();
  const { rememberOptionTemplate } = require('../services/optionTemplates');
  for (const group of await OptionGroup.findAll()) await rememberOptionTemplate(group.toJSON());
  await rememberOptionTemplate({ name: 'Penyajian', min_choices: 1, max_choices: 1, is_active: true, choices: [
    { id: 'preset-ice', name: 'Ice', price: 0, is_available: true },
    { id: 'preset-hot', name: 'Hot', price: 0, is_available: true },
  ] });
  const query = sequelize.getQueryInterface();
  const columns = await query.describeTable('order_items');
  const additions = {
    base_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    selected_options: { type: DataTypes.JSON, allowNull: true },
    stock_usage: { type: DataTypes.JSON, allowNull: true },
    stock_deducted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    stock_refunded: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  };
  for (const [name, definition] of Object.entries(additions)) {
    if (!columns[name]) await query.addColumn('order_items', name, definition);
  }
}

module.exports = migrate;
if (require.main === module) {
  migrate().then(() => console.log('Menu options migration complete.'))
    .catch((error) => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
