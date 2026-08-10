import { useState, useEffect } from 'react';
import { userAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch } from 'react-icons/hi';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', role: 'kasir' });

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try {
      const res = await userAPI.getAll({ search });
      setUsers(res.data.data);
    } catch (err) { toast.error('Gagal memuat data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, [search]);

  const openCreate = () => { setEditUser(null); setForm({ name: '', email: '', username: '', password: '', role: 'kasir' }); setShowModal(true); };
  const openEdit = (user) => { setEditUser(user); setForm({ name: user.name, email: user.email, username: user.username, password: '', role: user.role }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editUser) {
        const data = { ...form };
        if (!data.password) delete data.password;
        await userAPI.update(editUser.id, data);
        toast.success('Akun berhasil diperbarui.');
      } else {
        await userAPI.create(form);
        toast.success('Akun berhasil dibuat.');
      }
      setShowModal(false);
      loadUsers();
    } catch (err) { toast.error(err.response?.data?.message || 'Gagal menyimpan.'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Yakin ingin menghapus akun ini?')) return;
    try { await userAPI.delete(id); toast.success('Akun dihapus.'); loadUsers(); }
    catch (err) { toast.error(err.response?.data?.message || 'Gagal menghapus.'); }
  };

  const roleColors = { owner: 'badge-primary', manajer: 'badge-info', kasir: 'badge-success', kitchen: 'badge-danger' };

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Manajemen Pengguna</h1><p className="page-subtitle">Kelola akun staff Kitkop.id</p></div>
        <button className="btn btn-primary" onClick={openCreate}><HiOutlinePlus /> Tambah Staff</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar" style={{ maxWidth: 300 }}>
            <HiOutlineSearch className="search-icon" />
            <input placeholder="Cari pengguna..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Nama</th><th>Email</th><th>Username</th><th>Role</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.username}</td>
                  <td><span className={`badge ${roleColors[u.role]}`}>{u.role}</span></td>
                  <td><span className={`badge ${u.is_active ? 'badge-success' : 'badge-neutral'}`}>{u.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}><HiOutlinePencil /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(u.id)} style={{ color: 'var(--danger-500)' }}><HiOutlineTrash /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editUser ? 'Edit Akun Staff' : 'Tambah Akun Staff'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nama</label>
                  <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <input className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Password {editUser && '(kosongkan jika tidak diubah)'}</label>
                  <input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} {...(!editUser && { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Role</label>
                  <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="kasir">Kasir</option>
                    <option value="kitchen">Dapur</option>
                    <option value="manajer">Manajer</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">{editUser ? 'Simpan' : 'Tambah'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
