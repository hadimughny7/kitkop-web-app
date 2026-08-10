import { useState, useEffect } from 'react';
import { stockAPI, recipeAPI, menuAPI, orderAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch, HiOutlineBookOpen, HiOutlineExclamationCircle, HiOutlineCheckCircle, HiOutlineCube, HiOutlineShoppingCart, HiOutlineUpload, HiOutlineMinusCircle } from 'react-icons/hi';
import { io } from 'socket.io-client';
import { useAuth } from '../../context/AuthContext';

const StockManagement = () => {
  const { hasRole } = useAuth();
  const isManager = hasRole('owner', 'manajer');
  const [stocks, setStocks] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [menus, setMenus] = useState([]);
  const [logs, setLogs] = useState([]);
  const [recentOrder, setRecentOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchStock, setSearchStock] = useState('');
  const [statusFilter, setStatusFilter] = useState(null);
  
  const [showStockModal, setShowStockModal] = useState(false);
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [showReduceModal, setShowReduceModal] = useState(false);
  const [showRecipeModal, setShowRecipeModal] = useState(false);
  
  const [editStock, setEditStock] = useState(null);
  const [editRecipe, setEditRecipe] = useState(null);
  const [selectedStock, setSelectedStock] = useState(null);

  const [stockForm, setStockForm] = useState({ name: '', unit: '', stock: 0, min_stock: 0 });
  const [restockForm, setRestockForm] = useState({ quantity: 0, notes: '' });
  const [reduceForm, setReduceForm] = useState({ quantity: 0, notes: '' });
  const [recipeForm, setRecipeForm] = useState({ menu_id: '', raw_material_id: '', quantity_used: 0 });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadStocks(), loadRecipes(), loadMenus(), loadLogs(), loadRecentOrder()]);
    setLoading(false);
  };

  useEffect(() => {
    const socket = io('http://localhost:5000');
    socket.on('stock-updated', () => {
      loadStocks();
      loadLogs();
    });
    socket.on('new-order', () => {
      // Small delay to ensure DB transaction committed
      setTimeout(() => {
        loadStocks();
        loadLogs();
        loadRecentOrder();
      }, 500);
    });
    return () => socket.disconnect();
  }, []);

  const loadStocks = async () => { try { const res = await stockAPI.getAll(); setStocks(res.data.data); } catch { toast.error('Gagal memuat stok'); } };
  const loadRecipes = async () => { try { const res = await recipeAPI.getAll(); setRecipes(res.data.data); } catch { toast.error('Gagal memuat resep'); } };
  const loadMenus = async () => { try { const res = await menuAPI.getAll(); setMenus(res.data.data); } catch { toast.error('Gagal memuat menu'); } };
  const loadLogs = async () => { try { const res = await stockAPI.getLogs({ limit: 10 }); setLogs(res.data.data); } catch { toast.error('Gagal memuat log'); } };
  const loadRecentOrder = async () => { 
    try { 
      const res = await orderAPI.getAll({ status: 'completed' }); 
      if (res.data.data.length > 0) setRecentOrder(res.data.data[0]);
    } catch { /* ignore */ } 
  };

  const formatDate = (date) => new Date(date).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatTime = (date) => new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // Stock Handlers
  const handleStockSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editStock) { await stockAPI.update(editStock.id, stockForm); toast.success('Stok diperbarui'); }
      else { await stockAPI.create(stockForm); toast.success('Bahan baku ditambahkan'); }
      setShowStockModal(false); loadStocks(); loadLogs();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menyimpan'); }
  };

  const handleRestockSubmit = async (e) => {
    e.preventDefault();
    try {
      await stockAPI.restock(selectedStock.id, restockForm);
      toast.success('Restock berhasil dicatat');
      setShowRestockModal(false); loadStocks(); loadLogs();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal restock'); }
  };

  const handleReduceSubmit = async (e) => {
    e.preventDefault();
    try {
      await stockAPI.reduce(selectedStock.id, reduceForm);
      toast.success('Pengurangan stok berhasil dicatat');
      setShowReduceModal(false); loadStocks(); loadLogs();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal mengurangi stok'); }
  };

  // Recipe Handlers
  const handleRecipeSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editRecipe) {
        await recipeAPI.update(editRecipe.id, recipeForm);
        toast.success('Resep diperbarui');
      } else {
        await recipeAPI.create(recipeForm);
        toast.success('Resep ditambahkan');
      }
      setShowRecipeModal(false); loadRecipes();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menyimpan resep'); }
  };

  const handleDeleteRecipe = async (id) => {
    if (!window.confirm('Hapus bahan resep ini?')) return;
    try { await recipeAPI.delete(id); toast.success('Bahan resep dihapus'); loadRecipes(); }
    catch { toast.error('Gagal menghapus'); }
  };

  const filteredStocks = stocks.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(searchStock.toLowerCase());
    if (!statusFilter) return matchSearch;
    if (statusFilter === 'menipis') return matchSearch && s.status === 'menipis';
    if (statusFilter === 'habis') return matchSearch && (s.status === 'kritis' || parseFloat(s.stock) <= 0);
    return matchSearch;
  });
  const totalMenipis = stocks.filter(s => s.status === 'menipis').length;
  const totalHabis = stocks.filter(s => s.status === 'kritis' || parseFloat(s.stock) <= 0).length;
  const totalResepAktif = [...new Set(recipes.map(r => r.menu_id))].length;

  // Group recipes by menu
  const groupedRecipes = recipes.reduce((acc, r) => {
    if (!acc[r.menu_id]) acc[r.menu_id] = { menu: r.menu, ingredients: [] };
    acc[r.menu_id].ingredients.push(r);
    return acc;
  }, {});

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 'var(--space-4)' }}>
        <div>
          <h1 className="page-title">Manajemen Stok Bahan Baku</h1>
          <p className="page-subtitle">Pantau bahan baku, resep menu, dan pengurangan stok otomatis dari setiap pesanan.</p>
        </div>
        <button className="btn btn-secondary">Tutup Kasir</button>
      </div>

      {/* Top Stat Cards */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' }}>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="stat-icon" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-700)' }}><HiOutlineCube /></div>
          <div>
            <p className="stat-label">Total Bahan Baku</p>
            <p className="stat-value" style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              {stocks.length} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--neutral-500)' }}>item</span>
            </p>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', border: statusFilter === 'menipis' ? '2px solid var(--warning-500)' : undefined, transition: 'all 0.2s' }} onClick={() => setStatusFilter(statusFilter === 'menipis' ? null : 'menipis')}>
          <div className="stat-icon" style={{ background: totalMenipis > 0 ? 'var(--warning-50)' : 'var(--neutral-100)', color: totalMenipis > 0 ? 'var(--warning-600)' : 'var(--neutral-400)' }}><HiOutlineExclamationCircle /></div>
          <div>
            <p className="stat-label">Stok Menipis</p>
            <p className="stat-value" style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              {totalMenipis} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--neutral-500)' }}>item</span>
            </p>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', cursor: 'pointer', border: statusFilter === 'habis' ? '2px solid var(--danger-500)' : undefined, transition: 'all 0.2s' }} onClick={() => setStatusFilter(statusFilter === 'habis' ? null : 'habis')}>
          <div className="stat-icon" style={{ background: totalHabis > 0 ? 'var(--danger-50)' : 'var(--neutral-100)', color: totalHabis > 0 ? 'var(--danger-600)' : 'var(--neutral-400)' }}><HiOutlineMinusCircle /></div>
          <div>
            <p className="stat-label">Stok Habis</p>
            <p className="stat-value" style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              {totalHabis} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--neutral-500)' }}>item</span>
            </p>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="stat-icon" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-700)' }}><HiOutlineBookOpen /></div>
          <div>
            <p className="stat-label">Resep Aktif</p>
            <p className="stat-value" style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              {totalResepAktif} <span style={{ fontSize: 'var(--text-sm)', fontWeight: 400, color: 'var(--neutral-500)' }}>resep</span>
            </p>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="stat-icon" style={{ background: 'var(--success-50)', color: 'var(--success-600)' }}><HiOutlineCheckCircle /></div>
          <div>
            <p className="stat-label">Auto Deduction</p>
            <p className="stat-value" style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-1)' }}>
              Aktif
            </p>
            <p style={{ fontSize: '11px', color: 'var(--neutral-500)' }}>Kurangi stok otomatis</p>
          </div>
        </div>
      </div>

      {/* Main Grid: Left (Tables) & Right (Sidebars) */}
      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
        
        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          
          {/* Daftar Bahan Baku Table */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Daftar Bahan Baku</h3>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <div className="search-bar" style={{ width: '200px' }}>
                  <HiOutlineSearch className="search-icon" />
                  <input placeholder="Cari bahan baku..." value={searchStock} onChange={(e) => setSearchStock(e.target.value)} style={{ padding: '8px 8px 8px 32px' }} />
                </div>
                {isManager && <button className="btn btn-secondary btn-sm" onClick={() => { setEditStock(null); setStockForm({ name: '', unit: '', stock: 0, min_stock: 0 }); setShowStockModal(true); }}><HiOutlinePlus /> Tambah</button>}
              </div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)', textTransform: 'uppercase' }}>
                    <th>Item</th>
                    <th>Kategori</th>
                    <th>Stok Saat Ini</th>
                    <th>Satuan</th>
                    <th>Minimum Stok</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStocks.map((s) => (
                    <tr key={s.id} style={{ background: parseFloat(s.stock) <= 0 ? 'var(--danger-50)' : parseFloat(s.stock) <= parseFloat(s.min_stock) ? 'var(--warning-50)' : undefined }}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: parseFloat(s.stock) <= 0 ? 'rgba(239,68,68,0.1)' : 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HiOutlineCube color={parseFloat(s.stock) <= 0 ? 'var(--danger-500)' : 'var(--neutral-400)'} /></div>
                        {s.name}
                      </td>
                      <td style={{ color: 'var(--neutral-500)' }}>{s.category || 'Bahan Baku'}</td>
                      <td style={{ fontWeight: 600, color: parseFloat(s.stock) <= 0 ? 'var(--danger-600)' : undefined }}>{s.stock}</td>
                      <td style={{ color: 'var(--neutral-500)' }}>{s.unit}</td>
                      <td style={{ color: 'var(--neutral-500)' }}>{s.min_stock}</td>
                      <td>
                        {parseFloat(s.stock) <= 0 ? 
                          <span className="badge badge-danger" style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger-600)' }}>Habis</span> : 
                         parseFloat(s.stock) <= parseFloat(s.min_stock) ? 
                          <span className="badge badge-warning" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--warning-600)' }}>Menipis</span> : 
                          <span className="badge" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-700)' }}>Aman</span>
                        }
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedStock(s); setRestockForm({ quantity: 0, notes: '' }); setShowRestockModal(true); }}>Restock</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-600)' }} onClick={() => { setSelectedStock(s); setReduceForm({ quantity: 0, notes: '' }); setShowReduceModal(true); }}>Kurangi</button>
                        {isManager && <button className="btn btn-ghost btn-sm" onClick={() => { setEditStock(s); setStockForm({ name: s.name, unit: s.unit, stock: s.stock, min_stock: s.min_stock }); setShowStockModal(true); }}><HiOutlinePencil /></button>}
                        {isManager && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-500)' }} onClick={() => { if(window.confirm('Hapus bahan baku ini?')) stockAPI.delete(s.id).then(() => { toast.success('Bahan baku dihapus'); loadStocks(); loadLogs(); }).catch(() => toast.error('Gagal menghapus')); }}><HiOutlineTrash /></button>}
                      </td>
                    </tr>
                  ))}
                  {filteredStocks.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>Tidak ada bahan baku ditemukan.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="card-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--neutral-500)', fontSize: 'var(--text-sm)' }}>
              <span>Menampilkan {filteredStocks.length} item</span>
            </div>
          </div>

          {/* Relasi Menu ke Bahan Baku */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: 'var(--text-lg)', margin: 0, display: 'inline-block', marginRight: '8px' }}>Relasi Menu ke Bahan Baku</h3>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)' }}>(Resep & Pengurangan Otomatis)</span>
              </div>
              {isManager && <button className="btn btn-secondary btn-sm" onClick={() => { setEditRecipe(null); setRecipeForm({ menu_id: menus[0]?.id||'', raw_material_id: stocks[0]?.id||'', quantity_used: 0 }); setShowRecipeModal(true); }}>
                <HiOutlinePlus /> Kelola Resep
              </button>}
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <table className="data-table">
                <thead>
                  <tr style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)', textTransform: 'uppercase' }}>
                    <th style={{ width: '25%' }}>Menu</th>
                    <th>Bahan Baku & Takaran</th>
                    <th style={{ width: '25%' }}>Catatan</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(groupedRecipes).map((group, idx) => (
                    <tr key={idx}>
                      <td style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 500 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><HiOutlineBookOpen color="var(--neutral-400)" /></div>
                        {group.menu?.name}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                          {group.ingredients.map((ing, i) => (
                            <div key={ing.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ border: '1px solid var(--neutral-200)', padding: '4px 8px', borderRadius: '4px', fontSize: '13px', background: 'var(--neutral-50)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ fontWeight: 500 }}>{ing.rawMaterial?.name}</span> <span style={{ color: 'var(--neutral-500)' }}>{ing.quantity_used} {ing.rawMaterial?.unit}</span>
                                {isManager && <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', color: 'var(--primary-600)', minHeight: 'auto', height: 'auto' }} onClick={() => { setEditRecipe(ing); setRecipeForm({ menu_id: ing.menu_id, raw_material_id: ing.raw_material_id, quantity_used: ing.quantity_used }); setShowRecipeModal(true); }}><HiOutlinePencil size={12}/></button>}
                                {isManager && <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', color: 'var(--danger-500)', minHeight: 'auto', height: 'auto' }} onClick={() => handleDeleteRecipe(ing.id)}><HiOutlineTrash size={12}/></button>}
                              </div>
                              {i < group.ingredients.length - 1 && <span style={{ color: 'var(--neutral-400)' }}>+</span>}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>Saat pesanan masuk, stok bahan baku berkurang otomatis.</td>
                      <td style={{ textAlign: 'right' }}>
                        {isManager && <button className="btn btn-ghost btn-sm" onClick={() => { setEditRecipe(null); setRecipeForm({ menu_id: group.menu?.id||'', raw_material_id: stocks[0]?.id||'', quantity_used: 0 }); setShowRecipeModal(true); }}><HiOutlinePlus /> Tambah Bahan</button>}
                      </td>
                    </tr>
                  ))}
                  {Object.keys(groupedRecipes).length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>Belum ada resep yang dibuat.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          
          {/* Pengurangan Otomatis Terbaru */}
          <div className="card" style={{ background: '#fcfcfc' }}>
            <div className="card-header" style={{ paddingBottom: 'var(--space-2)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', margin: 0 }}>Pengurangan Otomatis Terbaru</h3>
            </div>
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                <strong style={{ fontSize: 'var(--text-lg)' }}>{recentOrder ? `Order #${recentOrder.order_number}` : 'Order #KM-2041'}</strong>
                <span className="badge" style={{ background: 'var(--neutral-200)', color: 'var(--neutral-700)' }}>Baru</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--neutral-500)', marginBottom: 'var(--space-4)' }}>
                <span><HiOutlineCheckCircle style={{ verticalAlign: 'text-bottom' }}/> Kasir: Otomatis</span>
                <span>{recentOrder ? formatDate(recentOrder.created_at) : 'Hari ini'}</span>
              </div>

              <div style={{ marginBottom: 'var(--space-4)' }}>
                <p style={{ fontSize: '12px', color: 'var(--neutral-500)', marginBottom: '4px' }}>Pesanan</p>
                {recentOrder ? (
                  recentOrder.items?.map(item => (
                    <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, fontSize: '14px', marginBottom: '4px' }}>
                      <span>{item.menu?.name}</span>
                      <span>x{item.qty}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 500, fontSize: '14px' }}>
                    <span>Es Kopi Susu</span><span>x2</span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px dashed var(--neutral-300)', paddingTop: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <p style={{ fontSize: '12px', color: 'var(--neutral-500)', marginBottom: '8px' }}>Pengurangan Stok (Otomatis)</p>
                
                {recentOrder && recipes.length > 0 ? (
                  recentOrder.items?.map(item => {
                    const itemRecipes = recipes.filter(r => r.menu_id === item.menu_id);
                    return itemRecipes.map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
                        <span>{r.rawMaterial?.name}</span>
                        <span style={{ color: 'var(--danger-600)', fontWeight: 500 }}>-{r.quantity_used * item.qty} {r.rawMaterial?.unit}</span>
                      </div>
                    ));
                  })
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}><span>Espresso</span><span style={{ color: 'var(--danger-600)', fontWeight: 500 }}>-60 ml</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}><span>Susu Fresh</span><span style={{ color: 'var(--danger-600)', fontWeight: 500 }}>-240 ml</span></div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}><span>Gula Cair</span><span style={{ color: 'var(--danger-600)', fontWeight: 500 }}>-20 ml</span></div>
                  </>
                )}
              </div>

              <div style={{ background: 'var(--success-50)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success-700)', fontSize: '14px', fontWeight: 500 }}>
                <HiOutlineCheckCircle size={20} />
                Stok berhasil diperbarui
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Modals reuse existing state */}
      {/* Stock Modal */}
      {showStockModal && (
        <div className="modal-overlay" onClick={() => setShowStockModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>{editStock ? 'Edit Bahan Baku' : 'Tambah Bahan Baku'}</h2><button className="btn btn-ghost btn-sm" onClick={() => setShowStockModal(false)}>✕</button></div>
            <form onSubmit={handleStockSubmit}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Nama Bahan</label><input className="form-input" value={stockForm.name} onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })} required /></div>
                <div className="form-group"><label className="form-label">Satuan (Misal: gram, ml, pcs)</label><input className="form-input" value={stockForm.unit} onChange={(e) => setStockForm({ ...stockForm, unit: e.target.value })} required /></div>
                <div className="grid grid-2">
                  <div className="form-group"><label className="form-label">{editStock ? 'Stok Saat Ini' : 'Stok Awal'}</label><input type="number" className="form-input" value={stockForm.stock} onChange={(e) => setStockForm({ ...stockForm, stock: parseFloat(e.target.value) })} required /></div>
                  <div className="form-group"><label className="form-label">Batas Minimum Kritis</label><input type="number" className="form-input" value={stockForm.min_stock} onChange={(e) => setStockForm({ ...stockForm, min_stock: parseFloat(e.target.value) })} required /></div>
                </div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowStockModal(false)}>Batal</button><button type="submit" className="btn btn-primary">Simpan</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {showRestockModal && selectedStock && (
        <div className="modal-overlay" onClick={() => setShowRestockModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Restock: {selectedStock.name}</h2><button className="btn btn-ghost btn-sm" onClick={() => setShowRestockModal(false)}>✕</button></div>
            <form onSubmit={handleRestockSubmit}>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-2)' }}>Stok saat ini: <strong>{selectedStock.stock} {selectedStock.unit}</strong></p>
                <div className="form-group"><label className="form-label">Jumlah Tambahan ({selectedStock.unit})</label><input type="number" min="0.1" step="0.1" className="form-input" value={restockForm.quantity} onChange={(e) => setRestockForm({ ...restockForm, quantity: parseFloat(e.target.value) })} required /></div>
                <div className="form-group"><label className="form-label">Catatan / Supplier</label><input className="form-input" value={restockForm.notes} onChange={(e) => setRestockForm({ ...restockForm, notes: e.target.value })} required /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowRestockModal(false)}>Batal</button><button type="submit" className="btn btn-success">Simpan Restock</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Reduce Modal */}
      {showReduceModal && selectedStock && (
        <div className="modal-overlay" onClick={() => setShowReduceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Kurangi Stok: {selectedStock.name}</h2><button className="btn btn-ghost btn-sm" onClick={() => setShowReduceModal(false)}>✕</button></div>
            <form onSubmit={handleReduceSubmit}>
              <div className="modal-body">
                <p style={{ marginBottom: 'var(--space-2)' }}>Stok saat ini: <strong>{selectedStock.stock} {selectedStock.unit}</strong></p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)', marginBottom: 'var(--space-4)' }}>Gunakan fitur ini untuk mengurangi stok bahan baku yang kadaluarsa, rusak, atau tidak layak pakai.</p>
                <div className="form-group"><label className="form-label">Jumlah Pengurangan ({selectedStock.unit})</label><input type="number" min="0.1" step="0.1" className="form-input" value={reduceForm.quantity} onChange={(e) => setReduceForm({ ...reduceForm, quantity: parseFloat(e.target.value) })} required /></div>
                <div className="form-group"><label className="form-label">Alasan Pengurangan</label><input className="form-input" placeholder="Contoh: Kadaluarsa, rusak, tidak layak pakai" value={reduceForm.notes} onChange={(e) => setReduceForm({ ...reduceForm, notes: e.target.value })} required /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowReduceModal(false)}>Batal</button><button type="submit" className="btn btn-danger">Kurangi Stok</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Recipe Modal */}
      {showRecipeModal && (
        <div className="modal-overlay" onClick={() => setShowRecipeModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>{editRecipe ? 'Edit Takaran Resep' : 'Tambah Komposisi Resep'}</h2><button className="btn btn-ghost btn-sm" onClick={() => setShowRecipeModal(false)}>✕</button></div>
            <form onSubmit={handleRecipeSubmit}>
              <div className="modal-body">
                <div className="form-group"><label className="form-label">Pilih Menu</label><select className="form-select" value={recipeForm.menu_id} onChange={(e) => setRecipeForm({ ...recipeForm, menu_id: e.target.value })} required disabled={!!editRecipe}>{menus.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                <div className="form-group"><label className="form-label">Bahan Baku</label><select className="form-select" value={recipeForm.raw_material_id} onChange={(e) => setRecipeForm({ ...recipeForm, raw_material_id: e.target.value })} required disabled={!!editRecipe}>{stocks.map(s => <option key={s.id} value={s.id}>{s.name} ({s.unit})</option>)}</select></div>
                <div className="form-group"><label className="form-label">Kebutuhan Per 1 Porsi</label><input type="number" step="0.01" min="0" className="form-input" value={recipeForm.quantity_used} onChange={(e) => setRecipeForm({ ...recipeForm, quantity_used: parseFloat(e.target.value) })} required /></div>
              </div>
              <div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={() => setShowRecipeModal(false)}>Batal</button><button type="submit" className="btn btn-primary">Simpan</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockManagement;
