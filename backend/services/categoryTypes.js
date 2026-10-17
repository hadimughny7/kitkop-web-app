// Category names are the only manager-facing classification. IDs and client
// item_type fields carry no meaning; each order keeps its own type snapshot.
const categoryItemType = name => {
  const normalized = typeof name === 'string'
    ? name.normalize('NFKC').toLowerCase().replace(/[-_&()/]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
  if (/^(snacks?|camilan|cemilan)(\s|$)/.test(normalized)) return 'snack';
  if (/^(minuman|drinks?|beverages?|coffee|non coffee|kopi|non kopi|tea|teh|jus|juice|matcha)(\s|$)/.test(normalized)
    || normalized === 'manual brew') return 'minuman';
  // Preserve the previous food fallback for custom or mixed category names.
  return 'makanan';
};

module.exports = { categoryItemType };
