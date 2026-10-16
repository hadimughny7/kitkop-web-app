const { QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const constraint = 'chk_menu_recipes_quantity_positive';
const auditInvalidRecipes = () => sequelize.query(
  'SELECT id, menu_id, raw_material_id, quantity_used FROM menu_recipes WHERE quantity_used <= 0 OR quantity_used IS NULL ORDER BY id',
  { type: QueryTypes.SELECT },
);
const constraintDefinition = async () => {
  const [rows] = await sequelize.query('SHOW CREATE TABLE menu_recipes');
  return rows[0]['Create Table'].split('\n').find(line => line.includes(`CONSTRAINT \`${constraint}\``));
};

const migrate = async ({ logger = console } = {}) => {
  const invalidRecipes = await auditInvalidRecipes();
  if (invalidRecipes.length) {
    // Quantities are business data; never invent replacement values or delete rows.
    logger.warn(`Recipe CHECK was not added: correct quantity_used for recipe IDs ${invalidRecipes.map(row => row.id).join(', ')} and rerun the migration. API and stock validation remain active.`);
    return { enforced: false, invalidRecipes };
  }
  const existing = await constraintDefinition();
  if (existing && !existing.includes('NOT ENFORCED')) return { enforced: true, invalidRecipes: [] };
  try {
    await sequelize.query(existing
      ? `ALTER TABLE menu_recipes ALTER CHECK \`${constraint}\` ENFORCED`
      : `ALTER TABLE menu_recipes ADD CONSTRAINT \`${constraint}\` CHECK (quantity_used IS NOT NULL AND quantity_used > 0)`);
  } catch (error) {
    // Another server may have installed it while this process was starting.
    const current = await constraintDefinition();
    if (current && !current.includes('NOT ENFORCED')) return { enforced: true, invalidRecipes: [] };
    if (!['ER_PARSE_ERROR', 'ER_NOT_SUPPORTED_YET'].includes(error.original?.code)) throw error;
  }
  // Older MySQL versions can silently ignore CHECK; verify that it was retained.
  const definition = await constraintDefinition();
  const enforced = Boolean(definition && !definition.includes('NOT ENFORCED'));
  if (!enforced) logger.warn('This database does not enforce recipe CHECK constraints. API, model and stock validation remain active.');
  return { enforced, invalidRecipes: [] };
};

module.exports = migrate;
module.exports.auditInvalidRecipes = auditInvalidRecipes;
if (require.main === module) {
  const operation = process.argv.includes('--audit') ? auditInvalidRecipes() : migrate();
  operation.then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => sequelize.close());
}
