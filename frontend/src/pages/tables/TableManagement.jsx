import { useState, useEffect } from 'react';
import { tableAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlinePrinter,
  HiOutlineQrcode,
  HiOutlineTable,
} from 'react-icons/hi';
import { QRCodeSVG as QRCode } from 'qrcode.react';

const TableManagement = () => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const { hasRole } = useAuth();
  const isManager = hasRole('owner') || hasRole('manajer');

  const [showTableModal, setShowTableModal] = useState(false);
  const [editTable, setEditTable] = useState(null);
  const [tableForm, setTableForm] = useState({ table_number: '', capacity: 4 });

  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    setLoading(true);
    try {
      const res = await tableAPI.getAll();
      setTables(res.data.data);
    } catch {
      toast.error('Gagal memuat data meja.');
    } finally {
      setLoading(false);
    }
  };

  const handleTableSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editTable) {
        await tableAPI.update(editTable.id, tableForm);
        toast.success('Meja berhasil diperbarui.');
      } else {
        await tableAPI.create(tableForm);
        toast.success('Meja berhasil ditambahkan.');
      }
      setShowTableModal(false);
      loadTables();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan meja.');
    }
  };

  const handleDeleteTable = async (id) => {
    if (!window.confirm('Hapus meja ini?')) return;
    try {
      await tableAPI.delete(id);
      toast.success('Meja berhasil dihapus.');
      loadTables();
    } catch {
      toast.error('Gagal menghapus meja.');
    }
  };

  const handleToggleActive = async (table) => {
    try {
      await tableAPI.update(table.id, { is_active: !table.is_active });
      toast.success(`Meja ${table.table_number} ${table.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`);
      loadTables();
    } catch {
      toast.error('Gagal mengubah status meja.');
    }
  };

  const handleBulkToggle = async (isActive) => {
    if (!window.confirm(`Apakah Anda yakin ingin ${isActive ? 'mengaktifkan' : 'menonaktifkan'} SEMUA meja?`)) return;
    try {
      await tableAPI.bulkToggle(isActive);
      toast.success(`Semua meja berhasil ${isActive ? 'diaktifkan' : 'dinonaktifkan'}.`);
      loadTables();
    } catch {
      toast.error('Gagal mengubah status semua meja.');
    }
  };

  const generateQRPayload = (tableNum) => {
    const baseUrl = window.location.origin;
    return `${baseUrl}/order/welcome?table=${tableNum}`;
  };

  const openQRModal = (table) => {
    setSelectedTable(table);
    setShowQRModal(true);
  };

  const printQR = () => {
    const printContent = document.getElementById('qr-print-area').innerHTML;
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(`
      <html>
        <head>
          <title>Cetak QR Code Meja ${selectedTable.table_number}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .print-card { text-align: center; border: 2px dashed #ccc; padding: 40px; border-radius: 20px; }
            h1 { margin-bottom: 5px; font-size: 24px; }
            h2 { font-size: 36px; margin: 10px 0 20px; color: #b46a18; }
            p { color: #666; margin-bottom: 30px; }
          </style>
        </head>
        <body>
          <div class="print-card">
            ${printContent}
            <h2>Meja ${selectedTable.table_number}</h2>
            <p>Scan untuk melihat menu dan memesan</p>
            <h3>Kitkop.id — Kedai Kopi</h3>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const totalActive = tables.filter((t) => t.is_active).length;
  const totalInactive = tables.filter((t) => !t.is_active).length;

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Meja</h1>
          <p className="page-subtitle">Kelola meja dan QR Code pelanggan</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            className="btn btn-danger"
            onClick={() => handleBulkToggle(false)}
            title="Nonaktifkan Semua Meja"
          >
            Nonaktifkan Semua
          </button>
          <button
            className="btn btn-success"
            onClick={() => handleBulkToggle(true)}
            title="Aktifkan Semua Meja"
          >
            Aktifkan Semua
          </button>
          {isManager && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditTable(null);
                setTableForm({ table_number: '', capacity: 4 });
                setShowTableModal(true);
              }}
            >
              <HiOutlinePlus /> Tambah Meja
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-3" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="stat-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}><HiOutlineTable /></div>
          <div>
            <p className="stat-label">Total Meja</p>
            <p className="stat-value">{tables.length}</p>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="stat-icon" style={{ background: 'var(--success-50)', color: 'var(--success-600)' }}><HiOutlineQrcode /></div>
          <div>
            <p className="stat-label">Meja Aktif</p>
            <p className="stat-value" style={{ color: 'var(--success-600)' }}>{totalActive}</p>
          </div>
        </div>
        <div className="stat-card" style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div className="stat-icon" style={{ background: 'var(--neutral-100)', color: 'var(--neutral-500)' }}><HiOutlineTable /></div>
          <div>
            <p className="stat-label">Meja Nonaktif</p>
            <p className="stat-value" style={{ color: 'var(--neutral-500)' }}>{totalInactive}</p>
          </div>
        </div>
      </div>

      {/* Table Grid */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {tables.map((t) => (
          <div
            key={t.id}
            className="card"
            style={{
              opacity: t.is_active ? 1 : 0.6,
              border: t.is_active ? '2px solid var(--primary-200)' : '2px solid var(--neutral-200)',
              transition: 'all 0.2s ease',
            }}
          >
            <div className="card-body" style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--radius-xl)',
                  background: t.is_active ? 'var(--primary-50)' : 'var(--neutral-100)',
                  color: t.is_active ? 'var(--primary-600)' : 'var(--neutral-400)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto var(--space-3)',
                  fontSize: '1.8rem',
                  fontWeight: 800,
                }}
              >
                {t.table_number}
              </div>
              <h3 style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-1)' }}>Meja {t.table_number}</h3>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--neutral-500)', marginBottom: 'var(--space-2)' }}>
                Kapasitas: {t.capacity || '-'} orang
              </p>
              <span
                className={`badge ${t.is_active ? 'badge-success' : 'badge-neutral'}`}
                style={{ marginBottom: 'var(--space-3)', display: 'inline-block' }}
              >
                {t.is_active ? 'Aktif' : 'Nonaktif'}
              </span>

              <div style={{ display: 'flex', gap: 'var(--space-2)', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => openQRModal(t)}>
                  <HiOutlineQrcode /> QR Code
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleToggleActive(t)}
                >
                  {t.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                {isManager && (
                  <>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEditTable(t);
                        setTableForm({ table_number: t.table_number, capacity: t.capacity || 4 });
                        setShowTableModal(true);
                      }}
                    >
                      <HiOutlinePencil />
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger-600)' }} onClick={() => handleDeleteTable(t.id)}>
                      <HiOutlineTrash />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {tables.length === 0 && (
          <div className="card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 'var(--space-8)' }}>
            <HiOutlineTable style={{ fontSize: '3rem', color: 'var(--neutral-300)', marginBottom: 'var(--space-3)' }} />
            <h3 style={{ color: 'var(--neutral-500)' }}>Belum ada meja</h3>
            <p style={{ color: 'var(--neutral-400)', fontSize: 'var(--text-sm)' }}>Klik "Tambah Meja" untuk menambahkan meja baru.</p>
          </div>
        )}
      </div>

      {/* Add/Edit Table Modal */}
      {showTableModal && (
        <div className="modal-overlay" onClick={() => setShowTableModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editTable ? 'Edit Meja' : 'Tambah Meja Baru'}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTableModal(false)}>✕</button>
            </div>
            <form onSubmit={handleTableSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Nomor Meja</label>
                  <input
                    className="form-input"
                    value={tableForm.table_number}
                    onChange={(e) => setTableForm({ ...tableForm, table_number: e.target.value })}
                    placeholder="Contoh: 1, 2, A1"
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Kapasitas (orang)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={tableForm.capacity}
                    onChange={(e) => setTableForm({ ...tableForm, capacity: parseInt(e.target.value) })}
                    required
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowTableModal(false)}>Batal</button>
                <button type="submit" className="btn btn-primary">Simpan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && selectedTable && (
        <div className="modal-overlay" onClick={() => setShowQRModal(false)}>
          <div className="modal-content" style={{ maxWidth: 400, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>QR Code Meja {selectedTable.table_number}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowQRModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ alignItems: 'center' }}>
              <div id="qr-print-area" style={{ background: 'white', padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)', display: 'inline-block' }}>
                <QRCode value={generateQRPayload(selectedTable.table_number)} size={200} level="H" includeMargin={true} />
              </div>
              <p style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-4)' }}>
                Pelanggan dapat memindai QR code ini untuk melihat menu dan memesan langsung dari meja mereka.
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center' }}>
              <button className="btn btn-primary" onClick={printQR}><HiOutlinePrinter /> Cetak QR Code</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableManagement;
