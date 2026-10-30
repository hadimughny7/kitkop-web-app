const storageKey = 'kitkop_order_session';
let cachedToken = null;

export const getOrderSessionToken = () => {
  try { return localStorage.getItem(storageKey) || cachedToken; }
  catch { return cachedToken; }
};

export const rememberOrderSession = token => {
  if (typeof token !== 'string' || !token || token.length > 2048) return;
  cachedToken = token;
  try { localStorage.setItem(storageKey, token); }
  catch { /* Keep the same session in memory when browser storage is unavailable. */ }
};
