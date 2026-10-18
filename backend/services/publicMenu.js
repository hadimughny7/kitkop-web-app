// Build a customer representation explicitly: never spread ORM relations or JSON
// choice metadata into a public response, even if new internal fields are added.
const pickScalars = (source, fields) => Object.fromEntries(fields.flatMap(field => {
  const value = source?.[field];
  return Object.hasOwn(source || {}, field) && (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    ? [[field, value]] : [];
}));

const publicMenu = menu => {
  const data = typeof menu.toJSON === 'function' ? menu.toJSON() : menu;
  const groups = Array.isArray(data.optionGroups) ? data.optionGroups : [];
  return {
    ...pickScalars(data, ['id', 'category_id', 'name', 'description', 'price', 'image', 'is_available']),
    category: data.category ? pickScalars(data.category, ['id', 'name']) : null,
    optionGroups: [...groups]
      .sort((a, b) => (a.MenuOptionGroup?.sort_order || 0) - (b.MenuOptionGroup?.sort_order || 0))
      .map(group => ({
        ...pickScalars(group, ['id', 'name', 'min_choices', 'max_choices', 'is_active']),
        choices: (Array.isArray(group.choices) ? group.choices : []).map(choice =>
          pickScalars(choice, ['id', 'name', 'price', 'is_available', 'is_default'])),
      })),
  };
};

module.exports = publicMenu;
