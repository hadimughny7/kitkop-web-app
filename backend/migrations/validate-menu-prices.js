const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const constraint = 'chk_menus_price_nonnegative';
const auditInvalidPrices = () => sequelize.query(
  'SELECT id, price FROM menus WHERE price < 0 OR price IS NULL ORDER BY id',
  { type: QueryTypes.SELECT },
);
const constraintDefinition = async () => {
  const [rows] = await sequelize.query('SHOW CREATE TABLE menus');
  return rows[0]['Create Table'].split('\n').find(line => line.includes(`CONSTRAINT \`${constraint}\``));
};

const migrate = async ({ logger = console } = {}) => {
  const invalidMenus = await auditInvalidPrices();
  if (invalidMenus.length) {
    logger.warn(`Menu price CHECK was not added: correct price for menu IDs ${invalidMenus.map(row => row.id).join(', ')} and rerun the migration. API, model and order price validation remain active.`);
    return { enforced: false, invalidMenus };
  }
  const existing = await constraintDefinition();
  if (existing && !existing.includes('NOT ENFORCED')) return { enforced: true, invalidMenus: [] };
  try {
    await sequelize.query(existing
      ? `ALTER TABLE menus ALTER CHECK \`${constraint}\` ENFORCED`
      : `ALTER TABLE menus ADD CONSTRAINT \`${constraint}\` CHECK (price IS NOT NULL AND price >= 0)`);
  } catch (error) {
    const current = await constraintDefinition();
    if (current && !current.includes('NOT ENFORCED')) return { enforced: true, invalidMenus: [] };
    if (!['ER_PARSE_ERROR', 'ER_NOT_SUPPORTED_YET'].includes(error.original?.code)) throw error;
  }
  const definition = await constraintDefinition();
  const enforced = Boolean(definition && !definition.includes('NOT ENFORCED'));
  if (!enforced) logger.warn('This database does not enforce menu price CHECK constraints. API, model and order price validation remain active.');
  return { enforced, invalidMenus: [] };
};

module.exports = migrate;
module.exports.auditInvalidPrices = auditInvalidPrices;
if (require.main === module) {
  const operation = process.argv.includes('--audit') ? auditInvalidPrices() : migrate();
  operation.then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
