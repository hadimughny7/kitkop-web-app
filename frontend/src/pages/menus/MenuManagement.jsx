import { useState, useEffect } from 'react';
import { menuAPI, categoryAPI, BACKEND_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch, HiOutlineTag } from 'react-icons/hi';

const MenuManagement = () => {
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const { hasRole } = useAuth();
  const isManager = hasRole('owner') || hasRole('manajer');
  
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editMenu, setEditMenu] = useState(null);
  const [editCat, setEditCat] = useState(null);
  
  const [form, setForm] = useState({ name: '', description: '', price: '', category_id: '', is_available: true });
  const [imageFile, setImageFile] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadMenus();
  }, [search, categoryFilter]);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadMenus(), loadCategories()]);
    setLoading(false);
  };

  const loadMenus = async () => {
    try {
      const res = await menuAPI.getAll({ search, category_id: categoryFilter });
      setMenus(res.data.data);
    } catch (err) { toast.error('Gagal memuat menu.'); }
  };

  const loadCategories = async () => {
    try {
      const res = await categoryAPI.getAll();
      setCategories(res.data.data);
    } catch (err) { toast.error('Gagal memuat kategori.'); }
  };

  const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  // Menu Handlers
  const openCreateMenu = () => {
    setEditMenu(null);
    setForm({ name: '', description: '', price: '', category_id: categories[0]?.id || '', is_available: true });
    setImageFile(null);
    setShowModal(true);
  };

  const openEditMenu = (menu) => {
    setEditMenu(menu);
    setForm({
      name: menu.name, description: menu.description || '',
      price: menu.price, category_id: menu.category_id,
      is_available: menu.is_available
    });
    setImageFile(null);
    setShowModal(true);
  };

  const handleMenuSubmit = async (e) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      Object.keys(form).forEach(key => formData.append(key, form[key]));
      if (imageFile) formData.append('image', imageFile);

      if (editMenu) {
        await menuAPI.update(editMenu.id, formData);
        toast.success('Menu diperbarui.');
      } else {
        await menuAPI.create(formData);
        toast.success('Menu ditambahkan.');
      }
      setShowModal(false);
      loadMenus();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menyimpan menu.'); }
  };

  const handleDeleteMenu = async (id) => {
    if (!window.confirm('Yakin ingin menghapus menu ini?')) return;
    try {
      await menuAPI.delete(id);
      toast.success('Menu dihapus.');
      loadMenus();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus menu.'); }
  };

  const toggleAvailability = async (id) => {
    try {
      await menuAPI.toggleAvailability(id);
      toast.success('Status menu diperbarui.');
      loadMenus();
    } catch (err) { toast.error('Gagal update status menu.'); }
  };

  // Category Handlers
  const handleCatSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editCat) {
        await categoryAPI.update(editCat.id, catForm);
        toast.success('Kategori diperbarui.');
      } else {
        await categoryAPI.create(catForm);
        toast.success('Kategori ditambahkan.');
      }
      setShowCatModal(false);
      loadCategories();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menyimpan kategori.'); }
  };

  const handleDeleteCat = async (id) => {
    if (!window.confirm('Yakin ingin menghapus kategori ini? Pastikan tidak ada menu yang menggunakan kategori ini.')) return;
    try {
      await categoryAPI.delete(id);
      toast.success('Kategori dihapus.');
      loadCategories();
      if (categoryFilter === String(id)) setCategoryFilter('');
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus kategori.'); }
  };

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Manajemen Menu & Kategori</h1>
          <p className="page-subtitle">Kelola daftar menu yang ditampilkan ke pelanggan</p>
        </div>
        {isManager && (
          <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={() => { setEditCat(null); setCatForm({ name: '', description: '' }); setShowCatModal(true); }}>
              <HiOutlineTag /> Kelola Kategori
            </button>
            <button className="btn btn-primary" onClick={openCreateMenu}>
              <HiOutlinePlus /> Tambah Menu
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header" style={{ flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          <div className="search-bar" style={{ flex: '1 1 300px' }}>
            <HiOutlineSearch className="search-icon" />
            <input placeholder="Cari menu..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="form-select" style={{ width: '200px' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Semua Kategori</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>Foto</th>
                <th>Nama Menu</th>
                <th>Kategori</th>
                <th>Harga</th>
                <th>Status</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {menus.map((m) => (
                <tr key={m.id} style={{ opacity: m.is_available ? 1 : 0.6 }}>
                  <td>
                    {m.image ? (
                      <img src={`${BACKEND_URL}${m.image}`} alt={m.name} style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🍽️</div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.name}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)' }}>{m.description?.substring(0, 50)}...</div>
                  </td>
                  <td><span className="badge badge-neutral">{m.category?.name}</span></td>
                  <td style={{ fontWeight: 600, color: 'var(--primary-600)' }}>{formatCurrency(m.price)}</td>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={m.is_available} onChange={() => toggleAvailability(m.id)} style={{ width: 16, height: 16, accentColor: 'var(--success-500)' }} />
                      <span className={`badge ${m.is_available ? 'badge-success' : 'badge-danger'}`}>{m.is_available ? 'Tersedia' : 'Habis'}</span>
                    </label>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {isManager && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditMenu(m)}><HiOutlinePencil /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteMenu(m.id)} style={{ color: 'var(--danger-500)' }}><HiOutlineTrash /></button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {menus.length === 0 && (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 'var(--space-8)' }}>Belum ada menu.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Menu Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editMenu ? 'Edit Menu' : 'Tambah Menu Baru'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMenuSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nama Menu *</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Kategori *</label>
                  <select className="form-select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Harga *</label>
                  <input className="form-input" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Deskripsi</label>
                  <textarea className="form-input" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Foto Menu {editMenu && '(Kosongkan jika tidak diubah)'}</label>
                  <input type="file" className="form-input" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">{editMenu ? 'Simpan' : 'Tambah'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal-content" style={{ maxWidth: 600 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Kelola Kategori Menu</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCatModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ background: 'var(--neutral-50)' }}>
              <form onSubmit={handleCatSubmit} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Nama Kategori</label>
                  <input className="form-input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required placeholder="Misal: Minuman Dingin" />
                </div>
                <button type="submit" className="btn btn-primary">{editCat ? 'Update' : 'Tambah'}</button>
                {editCat && <button type="button" className="btn btn-secondary" onClick={() => { setEditCat(null); setCatForm({ name: '', description: '' }); }}>Batal Edit</button>}
              </form>

              <div className="card">
                <table className="data-table">
                  <thead><tr><th>Nama Kategori</th><th style={{ width: 100 }}>Aksi</th></tr></thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setEditCat(c); setCatForm({ name: c.name, description: c.description || '' }); }}><HiOutlinePencil /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => handleDeleteCat(c.id)} style={{ color: 'var(--danger-500)' }}><HiOutlineTrash /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MenuManagement;
