import { useState, useEffect, useCallback, useRef } from 'react';
import { userAPI } from '../../services/api';
import { useAuth } from '../../context/useAuth';
import toast from 'react-hot-toast';
import { HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineSearch } from 'react-icons/hi';
import './UserManagement.css';
import Modal from '../../components/Modal';
import LoadingState from '../../components/LoadingState';

const UserManagement = () => {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '', role: 'kasir' });
  const isOwner = user?.role === 'owner';
  const managedRoles = ['kasir', 'kitchen', 'barista'];
  const canEdit = (target) => isOwner || target.id === user?.id || managedRoles.includes(target.role);
  const canDelete = (target) => target.id !== user?.id && (isOwner || managedRoles.includes(target.role));
  const editingOwnManagerProfile = !isOwner && editUser?.id === user?.id;

  const userRequest = useRef(0);
  const loadUsers = useCallback(() => {
    const request = ++userRequest.current;
    return userAPI.getAll({ search })
      .then(res => { if (request === userRequest.current) setUsers(res.data.data); })
      .catch(() => { if (request === userRequest.current) toast.error('Gagal memuat data.'); })
      .finally(() => { if (request === userRequest.current) setLoading(false); });
  }, [search]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openCreate = () => { setEditUser(null); setForm({ name: '', email: '', username: '', password: '', role: 'kasir' }); setShowModal(true); };
  const openEdit = (user) => { setEditUser(user); setForm({ name: user.name, email: user.email, username: user.username, password: '', role: user.role }); setShowModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editUser) {
        const data = { ...form };
        if (!data.password) delete data.password;
        await userAPI.update(editUser.id, data);
        if (data.password && editUser.id === user.id) {
          logout();
          toast.success('Password diperbarui. Silakan login ulang.');
          return;
        }
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

  const roleColors = { owner: 'badge-primary', manajer: 'badge-info', kasir: 'badge-success', kitchen: 'badge-danger', barista: 'badge-info' };

  if (loading) return <LoadingState>Memuat pengguna...</LoadingState>;

  return (
    <div className="user-management">
      <div className="page-header">
        <div><h1 className="page-title">Manajemen Pengguna</h1><p className="page-subtitle">Kelola akun staff Kitkop.id</p></div>
        <button className="btn btn-primary" onClick={openCreate}><HiOutlinePlus /> Tambah Staff</button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="search-bar" style={{ maxWidth: 300 }}>
            <HiOutlineSearch className="search-icon" />
            <input aria-label="Cari pengguna" placeholder="Cari pengguna..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
                      {canEdit(u) && <button className="btn btn-ghost btn-sm" aria-label={`Edit akun ${u.name}`} onClick={() => openEdit(u)}><HiOutlinePencil /></button>}
                      {canDelete(u) && <button className="btn btn-ghost btn-sm" aria-label={`Hapus akun ${u.name}`} onClick={() => handleDelete(u.id)} style={{ color: 'var(--danger-500)' }}><HiOutlineTrash /></button>}
                      {!canEdit(u) && <span className="account-access-note">Dikelola Owner</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal label={editUser ? 'Edit Akun Staff' : 'Tambah Akun Staff'} onClose={() => setShowModal(false)}>
            <div className="modal-header">
              <h2>{editUser ? 'Edit Akun Staff' : 'Tambah Akun Staff'}</h2>
              <button className="btn btn-ghost btn-sm" aria-label="Tutup formulir pengguna" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-name">Nama</label>
                  <input id="staff-name" className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-email">Email</label>
                  <input id="staff-email" className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-username">Username</label>
                  <input id="staff-username" className="form-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-password">Password {editUser && '(kosongkan jika tidak diubah)'}</label>
                  <input id="staff-password" className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} {...(!editUser && { required: true })} />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="staff-role">Role</label>
                  <select id="staff-role" className="form-select" value={form.role} disabled={editingOwnManagerProfile} aria-describedby={editingOwnManagerProfile ? 'staff-role-help' : undefined} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    <option value="kasir">Kasir</option>
                    <option value="barista">Barista</option>
                    <option value="kitchen">Dapur</option>
                    {(isOwner || editingOwnManagerProfile) && <option value="manajer">Manajer</option>}
                    {isOwner && <option value="owner">Owner</option>}
                  </select>
                  {editingOwnManagerProfile && <p id="staff-role-help" className="account-access-note">Hanya Owner yang dapat mengubah role akun Manajer.</p>}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">{editUser ? 'Simpan' : 'Tambah'}</button>
              </div>
            </form>
        </Modal>
      )}
    </div>
  );
};

export default UserManagement;
