import MenuOptionsEditor from './MenuOptionsEditor';
import Modal from '../../components/Modal';
import LoadingState from '../../components/LoadingState';
import { useState, useEffect, useRef, useCallback } from 'react';
import { menuAPI, categoryAPI, stockAPI, optionTemplateAPI, BACKEND_URL } from '../../services/api';
import { useAuth } from '../../context/useAuth';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch, HiOutlineTag } from 'react-icons/hi';
import './MenuManagement.css';

const MenuManagement = () => {
  const menuDialog = useRef(null);
  const [optionGroups, setOptionGroups] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState('');
  const [deletingTemplate, setDeletingTemplate] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [opening, setOpening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loaded, setLoaded] = useState({ menus: false, categories: false });
  const loading = !loaded.menus || !loaded.categories;
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const { hasRole } = useAuth();
  const isManager = hasRole('owner') || hasRole('manajer');
  
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  useEffect(() => {
    if (showModal) menuDialog.current?.showModal();
  }, [showModal]);
  const [editMenu, setEditMenu] = useState(null);
  const [editCat, setEditCat] = useState(null);
  
  const [form, setForm] = useState({ name: '', description: '', price: '', category_id: '', is_available: true });
  const [imageFile, setImageFile] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', description: '' });

  useEffect(() => {
    if (!isManager) return;
    stockAPI.getAll().then((res) => setMaterials(res.data.data)).catch(() => toast.error('Daftar bahan belum dapat dimuat.'));
  }, [isManager]);

  const fetchTemplates = useCallback(() => {
    if (!isManager) return;
    return optionTemplateAPI.getAll()
      .then(res => { setTemplates(res.data.data); setTemplatesError(''); })
      .catch(() => setTemplatesError('Daftar add-on belum dapat dimuat.'))
      .finally(() => setTemplatesLoading(false));
  }, [isManager]);
  const loadTemplates = () => {
    setTemplatesLoading(true); setTemplatesError('');
    return fetchTemplates();
  };
  const deleteTemplate = async (template) => {
    setDeletingTemplate(template.id);
    try {
      await optionTemplateAPI.delete(template.id);
      setTemplates((prev) => prev.filter((t) => t.id !== template.id));
      toast.success('Dihapus dari daftar tersimpan. Opsi pada menu tetap ada.');
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus add-on tersimpan.'); }
    finally { setDeletingTemplate(null); }
  };

  const menuRequest = useRef(0);
  const loadMenus = useCallback(() => {
    const request = ++menuRequest.current;
    return menuAPI.getAll({ search, category_id: categoryFilter })
      .then(res => { if (request === menuRequest.current) setMenus(res.data.data); })
      .catch(() => { if (request === menuRequest.current) toast.error('Gagal memuat menu.'); })
      .finally(() => { if (request === menuRequest.current) setLoaded(prev => ({ ...prev, menus: true })); });
  }, [search, categoryFilter]);

  const loadCategories = useCallback(() => categoryAPI.getAll()
    .then(res => setCategories(res.data.data))
    .catch(() => toast.error('Gagal memuat kategori.'))
    .finally(() => setLoaded(prev => ({ ...prev, categories: true }))), []);

  useEffect(() => { loadMenus(); }, [loadMenus]);
  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const formatCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  // Menu Handlers
  const openCreateMenu = () => {
    loadTemplates();
    setEditMenu(null);
    setOptionGroups([]);
    setForm({ name: '', description: '', price: '', category_id: categories[0]?.id || '', is_available: true });
    setImageFile(null);
    setShowModal(true);
  };

  const openEditMenu = async (menu) => {
    setOpening(true);
    try {
      const res = await menuAPI.getOptions(menu.id);
      loadTemplates();
      setEditMenu(menu);
      setOptionGroups(res.data.data);
      setForm({ name: menu.name, description: menu.description || '', price: menu.price, category_id: menu.category_id, is_available: menu.is_available });
      setImageFile(null);
      setShowModal(true);
    } catch { toast.error('Pilihan menu belum dapat dimuat. Coba lagi.'); }
    finally { setOpening(false); }
  };
  const toggleOptionAvailability = async (group, choice) => {
    setSaving(true);
    try {
      await menuAPI.setOptionAvailability(editMenu.id, group.id, choice.id, !choice.is_available);
      const res = await menuAPI.getOptions(editMenu.id);
      setOptionGroups(res.data.data);
      await loadMenus();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal mengubah ketersediaan.'); }
    finally { setSaving(false); }
  };

  const handleMenuSubmit = async (e) => {
    e.preventDefault();
    if (!isManager) return;
    setSaving(true);
    try {
      const formData = new FormData();
      Object.keys(form).forEach(key => formData.append(key, form[key]));
      formData.append('option_groups', JSON.stringify(optionGroups));
      if (imageFile) formData.append('image', imageFile);

      if (editMenu) {
        await menuAPI.update(editMenu.id, formData);
        toast.success('Menu diperbarui.');
      } else {
        await menuAPI.create(formData);
        toast.success('Menu ditambahkan.');
      }
      setShowModal(false);
      loadTemplates();
      loadMenus();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menyimpan menu.'); } finally { setSaving(false); }
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
    } catch { toast.error('Gagal update status menu.'); }
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

  if (loading) return <LoadingState>Memuat pengelolaan menu...</LoadingState>;

  return (
    <div className="menu-management">
      <div className="page-header">
        <div className="menu-management-heading">
          <h1 className="page-title">Manajemen Menu & Kategori</h1>
          <p className="page-subtitle">Kelola daftar menu yang ditampilkan ke pelanggan</p>
        </div>
        {isManager && (
          <div className="menu-management-actions">
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
            <input aria-label="Cari menu" placeholder="Cari menu..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select aria-label="Filter kategori menu" className="form-select" style={{ width: '200px' }} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
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
                      <div style={{ width: 48, height: 48, borderRadius: 'var(--radius-md)', background: 'var(--neutral-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}><HiOutlineTag aria-hidden="true" /></div>
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
                      {!isManager && <button className="btn btn-secondary btn-sm" disabled={opening} onClick={() => openEditMenu(m)}>Pilihan</button>}
                      {isManager && (
                        <>
                          <button className="btn btn-ghost btn-sm" aria-label={`Edit ${m.name}`} disabled={opening} onClick={() => openEditMenu(m)}><HiOutlinePencil /></button>
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
        <dialog ref={menuDialog} className="modal-content menu-editor-dialog" aria-labelledby="menu-editor-title" onCancel={(e) => { if (saving) e.preventDefault(); else setShowModal(false); }} onClick={(e) => { if (!saving && e.target === e.currentTarget) { const box = e.currentTarget.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) setShowModal(false); } }}>
            <div className="modal-header">
              <h2 id="menu-editor-title">{!isManager ? `Pilihan ${editMenu?.name}` : editMenu ? 'Edit Menu' : 'Tambah Menu Baru'}</h2>
              <button className="btn btn-ghost btn-sm" disabled={saving} aria-label="Tutup menu" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleMenuSubmit} className="menu-edit-form">
              <div className="modal-body">
                {isManager && <>
                <div className="form-group">
                  <label className="form-label" htmlFor="menu-name">Nama Menu *</label>
                  <input id="menu-name" className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="menu-category">Kategori *</label>
                  <select id="menu-category" className="form-select" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="menu-price">Harga *</label>
                  <input id="menu-price" className="form-input" type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="menu-description">Deskripsi</label>
                  <textarea id="menu-description" className="form-input" rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                </>}
                <MenuOptionsEditor groups={optionGroups} onChange={setOptionGroups} materials={materials} disabled={saving} availabilityOnly={!isManager} onAvailability={toggleOptionAvailability} templates={templates} templatesLoading={templatesLoading} templatesError={templatesError} onReloadTemplates={loadTemplates} onDeleteTemplate={deleteTemplate} deletingTemplate={deletingTemplate} />
                {isManager && <div className="form-group">
                  <label className="form-label" htmlFor="menu-photo">Foto Menu {editMenu && '(Kosongkan jika tidak diubah)'}</label>
                  <input id="menu-photo" type="file" className="form-input" accept="image/*" onChange={(e) => setImageFile(e.target.files[0])} />
                </div>}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowModal(false)}>{isManager ? 'Batal' : 'Tutup'}</button>
                <button type="submit" hidden={!isManager} disabled={saving} className="btn btn-primary">{saving ? 'Menyimpan...' : editMenu ? 'Simpan' : 'Tambah'}</button>
              </div>
            </form>
        </dialog>
      )}

      {/* Category Modal */}
      {showCatModal && (
        <Modal label="Kelola Kategori Menu" style={{ maxWidth: 600 }} onClose={() => setShowCatModal(false)}>
            <div className="modal-header">
              <h2>Kelola Kategori Menu</h2>
              <button className="btn btn-ghost btn-sm" aria-label="Tutup kategori menu" onClick={() => setShowCatModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ background: 'var(--neutral-50)' }}>
              <form onSubmit={handleCatSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
                <div className="form-group" style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <label className="form-label" htmlFor="category-name">Nama Kategori</label>
                  <input id="category-name" className="form-input" value={catForm.name} onChange={(e) => setCatForm({ ...catForm, name: e.target.value })} required placeholder="Misal: Minuman Dingin" />
                </div>
                <button type="submit" className="btn btn-primary">{editCat ? 'Update' : 'Tambah'}</button>
                {editCat && <button type="button" className="btn btn-secondary" onClick={() => { setEditCat(null); setCatForm({ name: '', description: '' }); }}>Batal Edit</button>}
              </form>

              <div className="card" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead><tr><th>Nama Kategori</th><th style={{ width: 100 }}>Aksi</th></tr></thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                            <button className="btn btn-ghost btn-sm" aria-label={`Edit kategori ${c.name}`} onClick={() => { setEditCat(c); setCatForm({ name: c.name, description: c.description || '' }); }}><HiOutlinePencil /></button>
                            <button className="btn btn-ghost btn-sm" aria-label={`Hapus kategori ${c.name}`} onClick={() => handleDeleteCat(c.id)} style={{ color: 'var(--danger-500)' }}><HiOutlineTrash /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
};

export default MenuManagement;
