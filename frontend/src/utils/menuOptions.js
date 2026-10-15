export const activeGroups = (menu) => (menu.optionGroups || []).filter((g) => g.is_active);
export const copyOptionTemplate = (template) => ({
  _editorId: crypto.randomUUID(), name: template.name, min_choices: template.min_choices,
  max_choices: template.max_choices, is_active: template.is_active,
  choices: template.choices.map((choice) => ({ ...structuredClone(choice), id: crypto.randomUUID() })),
});
export const optionText = (item) => (item.selected_options || []).map((o) => `${o.group_name}: ${o.name}`).join(' · ');
export const sameConfiguration = (a, b) => a.menu_id === b.menu_id && a.notes === b.notes &&
  [...(a.option_ids || [])].sort().join('|') === [...(b.option_ids || [])].sort().join('|');
export const makeCartItem = (menu, selections = [], notes = '') => ({
  line_id: crypto.randomUUID(), menu_id: menu.id, name: menu.name, image: menu.image,
  base_price: Number(menu.price), price: Math.round((Number(menu.price) + selections.reduce((sum, o) => sum + Number(o.price), 0)) * 100) / 100,
  option_ids: selections.map((o) => o.choice_id), selected_options: selections, qty: 1, notes,
  category: menu.category?.name || '',
});
export const addCartLine = (items, line) => {
  const match = items.find((i) => sameConfiguration(i, line) && i.price === line.price);
  return match ? items.map((i) => i.line_id === match.line_id ? { ...i, qty: i.qty + line.qty } : i) : [...items, line];
};
export const replaceCartLine = (items, id, replacement) => {
  const old = items.find((i) => i.line_id === id);
  if (!old) return items;
  return addCartLine(items.filter((i) => i.line_id !== id), { ...replacement, line_id: id, qty: old.qty });
};
