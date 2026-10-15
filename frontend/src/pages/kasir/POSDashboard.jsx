import MenuOptionPicker from '../../components/MenuOptionPicker';
import { activeGroups, optionText, makeCartItem, addCartLine, replaceCartLine } from '../../utils/menuOptions';
import { useState, useEffect } from 'react';
import { orderAPI, paymentAPI, menuAPI, categoryAPI, tableAPI, settingAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineCash, HiOutlinePlus, HiOutlineMinus, HiOutlineTrash, HiOutlineSearch, HiOutlineShoppingCart } from 'react-icons/hi';
import './POSDashboard.css';

const POSDashboard = () => {
  const [picking, setPicking] = useState(null);
  const [loading, setLoading] = useState(true);

  // === State untuk POS ===
  const [allMenus, setAllMenus] = useState([]);
  const [allCategories, setAllCategories] = useState([]);
  const [allTables, setAllTables] = useState([]);
  const [posActiveCategory, setPosActiveCategory] = useState('all');
  const [posSearch, setPosSearch] = useState('');
  const [posCart, setPosCart] = useState([]);
  const [posCustomer, setPosCustomer] = useState({ name: '', phone: '' });
  const [posSelectedTable, setPosSelectedTable] = useState('');
  const [posSubmitting, setPosSubmitting] = useState(false);
  const [taxPercent, setTaxPercent] = useState(10);
  const [servicePercent, setServicePercent] = useState(0);

  useEffect(() => {
    loadPosData();
  }, []);

  const loadPosData = async () => {
    try {
      const [menuRes, catRes, tableRes] = await Promise.all([
        menuAPI.getAll({ available_only: 'true' }),
        categoryAPI.getAll(),
        tableAPI.getAll(),
      ]);
      setAllMenus(menuRes.data.data);
      setAllCategories(catRes.data.data);
      setAllTables(tableRes.data.data || []);
      // Load settings
      try {
        const settingRes = await settingAPI.getAll();
        const sd = settingRes.data.data;
        if (sd.tax_percentage !== undefined) setTaxPercent(parseFloat(sd.tax_percentage));
        if (sd.service_charge_percentage !== undefined) setServicePercent(parseFloat(sd.service_charge_percentage));
      } catch (e) { /* fallback to defaults */ }
    } catch (err) {
      toast.error('Gagal memuat data menu.');
    } finally {
      setLoading(false);
    }
  };

  const posFilteredMenus = allMenus.filter((menu) => {
    const matchCategory = posActiveCategory === 'all' || menu.category_id === parseInt(posActiveCategory);
    const matchSearch = menu.name.toLowerCase().includes(posSearch.toLowerCase());
    return matchCategory && matchSearch;
  });

  const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);

  const getPosCartQty = (menuId) => posCart.filter((i) => i.menu_id === menuId).reduce((n,i) => n + i.qty, 0);
  const posAddItem = (menu) => {
    if (activeGroups(menu).length) { setPicking({ menu }); return; }
    setPosCart((prev) => addCartLine(prev, makeCartItem(menu)));
  };
  const editOptions = async (item) => {
    try { const res = await menuAPI.getById(item.menu_id); setPicking({ menu: res.data.data, item }); }
    catch { toast.error('Pilihan menu belum dapat dimuat.'); }
  };
  const posDecrementItem = (id) => setPosCart((prev) => prev.flatMap((i) => i.line_id !== id ? [i] : i.qty > 1 ? [{ ...i, qty: i.qty - 1 }] : []));
  const posRemoveItem = (id) => setPosCart((prev) => prev.filter((i) => i.line_id !== id));
  const posUpdateNotes = (id, notes) => setPosCart((prev) => prev.map((i) => i.line_id === id ? { ...i, notes } : i));
  const posIncrementItem = (id) => setPosCart((prev) => prev.map((i) => i.line_id === id ? { ...i, qty: i.qty + 1 } : i));

  const posSubtotal = posCart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const posTax = Math.round(posSubtotal * (taxPercent / 100));
  const posServiceCharge = Math.round(posSubtotal * (servicePercent / 100));
  const posTotal = posSubtotal + posTax + posServiceCharge;
  const posItemCount = posCart.reduce((sum, item) => sum + item.qty, 0);

  const handlePosSubmit = async () => {
    if (posCart.length === 0) {
      toast.error('Tambahkan minimal 1 item.');
      return;
    }
    if (!posCustomer.name.trim()) {
      toast.error('Nama pelanggan wajib diisi.');
      return;
    }

    setPosSubmitting(true);
    try {
      const orderData = {
        table_id: posSelectedTable || null,
        customer_name: posCustomer.name.trim(),
        customer_phone: posCustomer.phone.trim(),
        customer_email: '',
        order_type: 'kasir',
        items: posCart.map((item) => ({
          menu_id: item.menu_id,
          qty: item.qty,
          notes: item.notes,
          option_ids: item.option_ids,
          expected_price: item.price,
        })),
      };

      const res = await orderAPI.create(orderData);
      const order = res.data.data;

      // Langsung bayar cash
      await paymentAPI.payCash(order.id);

      toast.success('Pesanan berhasil dibuat & pembayaran tunai dicatat!');

      // Reset form
      setPosCart([]);
      setPosCustomer({ name: '', phone: '' });
      setPosSelectedTable('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal membuat pesanan.');
    } finally {
      setPosSubmitting(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div className="pos-page">
      {picking && <MenuOptionPicker key={picking.item?.line_id || picking.menu.id} menu={picking.menu} initialItem={picking.item} onClose={() => setPicking(null)} onConfirm={(selections, notes) => {
        const line = makeCartItem(picking.menu, selections, notes);
        setPosCart((prev) => picking.item ? replaceCartLine(prev, picking.item.line_id, line) : addCartLine(prev, line));
        setPicking(null);
      }} />}
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Kasir / POS</h1>
          <p className="page-subtitle">Buat pesanan langsung dari kasir</p>
        </div>
      </div>

      {/* ============================================
          INLINE POS — Menu + Cart side by side
          ============================================ */}
      <div className="pos-inline-layout">

        {/* LEFT: Menu Browser */}
        <div className="pos-menu-panel pos-inline-panel">
          <div className="pos-menu-panel-header">
            <h2>Pilih Menu</h2>
            <div className="pos-search-wrapper">
              <HiOutlineSearch className="pos-search-icon" />
              <input
                type="text"
                className="pos-search-input"
                placeholder="Cari menu..."
                value={posSearch}
                onChange={(e) => setPosSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="pos-category-tabs">
            <button
              className={`category-tab ${posActiveCategory === 'all' ? 'active' : ''}`}
              onClick={() => setPosActiveCategory('all')}
            >
              Semua
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat.id}
                className={`category-tab ${posActiveCategory === String(cat.id) ? 'active' : ''}`}
                onClick={() => setPosActiveCategory(String(cat.id))}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="pos-menu-grid">
            {posFilteredMenus.map((menu) => {
              const qty = getPosCartQty(menu.id);
              return (
                <div key={menu.id} className="pos-menu-item" onClick={() => posAddItem(menu)}>
                  <div className="pos-menu-item-info">
                    <p className="pos-menu-item-name">{menu.name}</p>
                    <p className="pos-menu-item-price">{formatCurrency(menu.price)}</p>
                  </div>
                  {qty > 0 && (
                    <div className="pos-menu-item-qty-badge">{qty}</div>
                  )}
                </div>
              );
            })}
            {posFilteredMenus.length === 0 && (
              <div className="empty-state" style={{ gridColumn: '1 / -1', padding: 'var(--space-8)' }}>
                <p>Menu tidak ditemukan</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Cart & Customer Info */}
        <div className="pos-cart-panel pos-inline-panel">
          <div className="pos-cart-panel-header">
            <h2>Pesanan ({posItemCount} item)</h2>
          </div>

          {/* Customer info */}
          <div className="pos-customer-form">
            <h4>Data Pelanggan</h4>
            <div className="pos-form-row">
              <input
                type="text"
                className="pos-input"
                placeholder="Nama pelanggan *"
                value={posCustomer.name}
                onChange={(e) => setPosCustomer((prev) => ({ ...prev, name: e.target.value }))}
                autoComplete="off"
              />
              <input
                type="text"
                className="pos-input"
                placeholder="No. Telepon (opsional)"
                value={posCustomer.phone}
                onChange={(e) => setPosCustomer((prev) => ({ ...prev, phone: e.target.value }))}
                autoComplete="off"
              />
            </div>
            <select
              className="pos-select"
              value={posSelectedTable}
              onChange={(e) => setPosSelectedTable(e.target.value)}
            >
              <option value="">Tanpa Meja (Takeaway)</option>
              {allTables.filter(t => t.is_active).map((t) => (
                <option key={t.id} value={t.id}>Meja {t.table_number}</option>
              ))}
            </select>
          </div>

          {/* Cart items */}
          <div className="pos-cart-items">
            {posCart.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
              <HiOutlineShoppingCart className="empty-icon" aria-hidden="true" />
                <h3>Belum ada item</h3>
                <p>Klik menu di sebelah kiri untuk menambahkan</p>
              </div>
            ) : (
              posCart.map((item) => (
                <div key={item.line_id} className="pos-cart-item">
                  <div className="pos-cart-item-info">
                    <p className="pos-cart-item-name">{item.name}</p>
                    <p className="selected-options">{optionText(item)}</p>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => editOptions(item)}>Edit pilihan</button>
                    <p className="pos-cart-item-price">{formatCurrency(item.price * item.qty)}</p>
                    <input
                      type="text"
                      className="pos-cart-item-notes"
                      placeholder="Catatan..."
                      value={item.notes}
                      onChange={(e) => posUpdateNotes(item.line_id, e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="pos-cart-item-actions">
                    <div className="pos-cart-qty-control">
                      <button className="pos-qty-btn" onClick={() => posDecrementItem(item.line_id)}>
                        <HiOutlineMinus />
                      </button>
                      <span className="pos-qty-val">{item.qty}</span>
                      <button className="pos-qty-btn" onClick={() => posIncrementItem(item.line_id)}>
                        <HiOutlinePlus />
                      </button>
                    </div>
                    <button className="pos-remove-btn" onClick={() => posRemoveItem(item.line_id)}>
                      <HiOutlineTrash />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Summary & Submit */}
          {posCart.length > 0 && (
            <div className="pos-cart-summary">
              <div className="pos-summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(posSubtotal)}</span>
              </div>
              <div className="pos-summary-row">
                <span>Pajak ({taxPercent}%)</span>
                <span>{formatCurrency(posTax)}</span>
              </div>
              {posServiceCharge > 0 && (
                <div className="pos-summary-row">
                  <span>Service Charge ({servicePercent}%)</span>
                  <span>{formatCurrency(posServiceCharge)}</span>
                </div>
              )}
              <div className="pos-summary-row pos-total">
                <span>Total</span>
                <span>{formatCurrency(posTotal)}</span>
              </div>
              <button
                className="pos-submit-btn"
                onClick={handlePosSubmit}
                disabled={posSubmitting}
              >
                <HiOutlineCash />
                {posSubmitting ? 'Memproses...' : `Buat Pesanan & Bayar Tunai — ${formatCurrency(posTotal)}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default POSDashboard;
