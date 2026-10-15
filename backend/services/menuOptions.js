const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const money = (value) => Math.round(Number(value) * 100);

function validateGroup(input) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const min = Number(input.min_choices);
  // Zero means unlimited; single-choice and positive limits keep their existing meaning.
  const max = input.max_choices === null || input.max_choices === '' ? NaN : Number(input.max_choices);
  if (!name || name.length > 100) fail('Nama kelompok wajib diisi, maksimal 100 karakter.');
  if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || min > 30 || max < 0 || (max > 0 && min > max) || max > 30) fail('Batas pilihan tidak valid. Gunakan 0 untuk tanpa batas.');
  if (!Array.isArray(input.choices) || !input.choices.length || input.choices.length > 50) fail('Isi 1–50 pilihan.');
  const ids = new Set();
  const choices = input.choices.map((choice) => {
    if (typeof choice.id !== 'string' || !/^[\w-]{1,64}$/.test(choice.id) || ids.has(choice.id)) fail('ID pilihan tidak valid atau duplikat.');
    ids.add(choice.id);
    if (typeof choice.name !== 'string' || !choice.name.trim() || choice.name.trim().length > 100) fail('Nama pilihan wajib diisi, maksimal 100 karakter.');
    if (choice.price === '' || !Number.isFinite(Number(choice.price)) || Number(choice.price) < 0 || Number(choice.price) > 10000000) fail('Harga tambahan tidak valid.');
    const ingredients = choice.ingredients || [];
    if (!Array.isArray(ingredients) || ingredients.length > 30) fail('Resep tambahan tidak valid.');
    const materials = new Set();
    ingredients.forEach((ingredient) => {
      if (!Number.isInteger(Number(ingredient.raw_material_id)) || Number(ingredient.raw_material_id) < 1 || materials.has(Number(ingredient.raw_material_id)) || !Number.isFinite(Number(ingredient.quantity_used)) || Number(ingredient.quantity_used) < 0.01 || Number(ingredient.quantity_used) > 1000000) fail('Bahan tambahan atau jumlah pemakaiannya tidak valid.');
      materials.add(Number(ingredient.raw_material_id));
    });
    return { id: choice.id, name: choice.name.trim(), price: money(choice.price) / 100,
      is_available: choice.is_available !== false, is_default: choice.is_default === true,
      ingredients: ingredients.map((i) => ({ raw_material_id: Number(i.raw_material_id), quantity_used: Number(i.quantity_used) })) };
  });
  const defaults = choices.filter((c) => c.is_default);
  if (defaults.some((c) => !c.is_available) || (max > 0 && defaults.length > max)) fail('Pilihan default harus tersedia dan tidak melebihi batas pilihan.');
  if (choices.length < min) fail('Jumlah pilihan kurang dari batas minimal.');
  return { name, min_choices: min, max_choices: max, is_active: input.is_active !== false, choices };
}

function resolveOptions(groups, choiceIds = []) {
  if (!Array.isArray(choiceIds) || choiceIds.length > 1000 || choiceIds.some((id) => typeof id !== 'string') || new Set(choiceIds).size !== choiceIds.length) fail('Daftar pilihan tidak valid atau duplikat.');
  const remaining = new Set(choiceIds);
  const selections = [];
  let extra = 0;
  for (const group of groups.filter((g) => g.is_active)) {
    const picked = group.choices.filter((c) => remaining.has(c.id));
    if (picked.length < group.min_choices || (group.max_choices > 0 && picked.length > group.max_choices)) fail(group.max_choices === 0 ? `${group.name}: pilih minimal ${group.min_choices} pilihan.` : `${group.name}: pilih ${group.min_choices}–${group.max_choices} pilihan.`);
    for (const choice of picked) {
      if (!choice.is_available) fail(`${choice.name} sedang tidak tersedia.`);
      remaining.delete(choice.id);
      extra += money(choice.price);
      selections.push({ group_id: group.id, group_name: group.name, choice_id: choice.id, name: choice.name, price: Number(choice.price), ingredients: choice.ingredients || [] });
    }
  }
  if (remaining.size) fail('Pilihan tidak tersedia atau bukan milik menu ini. Silakan pilih ulang.');
  return { selections, extra: extra / 100 };
}

function buildStockUsage(recipes, selections) {
  const usage = new Map();
  for (const ingredient of [...recipes, ...selections.flatMap((s) => s.ingredients || [])]) {
    const id = Number(ingredient.raw_material_id);
    usage.set(id, (usage.get(id) || 0) + Number(ingredient.quantity_used));
  }
  return [...usage].map(([raw_material_id, quantity_used]) => ({ raw_material_id, quantity_used: Math.round(quantity_used * 100) / 100 }));
}

module.exports = { validateGroup, resolveOptions, buildStockUsage, fail };
