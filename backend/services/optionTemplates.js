const { createHash } = require('node:crypto');
const { OptionTemplate } = require('../models');
const { validateGroup } = require('./menuOptions');

const templateFingerprint = (definition) => {
  const normalized = validateGroup(definition);
  normalized.choices = normalized.choices.map(({ id, ...choice }) => ({ ...choice,
    ingredients: [...choice.ingredients].sort((a, b) => a.raw_material_id - b.raw_material_id),
  }));
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};

async function rememberOptionTemplate(definition, transaction) {
  const normalized = validateGroup(definition);
  // A deleted fingerprint stays hidden on later saves, rather than reappearing.
  return OptionTemplate.findOrCreate({ where: { fingerprint: templateFingerprint(normalized) },
    defaults: normalized, transaction });
}

module.exports = { templateFingerprint, rememberOptionTemplate };
