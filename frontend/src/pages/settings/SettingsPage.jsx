import { useState, useEffect } from 'react';
import { settingAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { HiOutlineCog, HiOutlineSave } from 'react-icons/hi';

const SettingsPage = () => {
  const [taxPercent, setTaxPercent] = useState('');
  const [servicePercent, setServicePercent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await settingAPI.getAll();
      const data = res.data.data;
      setTaxPercent(data.tax_percentage ?? '10');
      setServicePercent(data.service_charge_percentage ?? '0');
    } catch (err) {
      toast.error('Gagal memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const taxVal = parseFloat(taxPercent);
    const serviceVal = parseFloat(servicePercent);

    if (isNaN(taxVal) || taxVal < 0 || taxVal > 100) {
      toast.error('Persentase pajak harus antara 0 - 100.');
      return;
    }
    if (isNaN(serviceVal) || serviceVal < 0 || serviceVal > 100) {
      toast.error('Persentase service charge harus antara 0 - 100.');
      return;
    }

    setSaving(true);
    try {
      await settingAPI.update({
        tax_percentage: taxVal,
        service_charge_percentage: serviceVal,
      });
      toast.success('Pengaturan berhasil disimpan!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-screen"><div className="spinner"></div></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pengaturan</h1>
          <p className="page-subtitle">Atur persentase pajak dan service charge untuk semua pesanan</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600 }}>
        <div className="card-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <HiOutlineCog /> Pajak & Service Charge
          </h3>
        </div>
        <form onSubmit={handleSave}>
          <div style={{ padding: 'var(--space-5)' }}>
            <div className="form-group">
              <label className="form-label">Pajak (%)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={taxPercent}
                onChange={(e) => setTaxPercent(e.target.value)}
                required
              />
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)', marginTop: 'var(--space-1)' }}>
                Persentase pajak yang dikenakan pada setiap pesanan. Contoh: 10 berarti 10%.
              </p>
            </div>

            <div className="form-group">
              <label className="form-label">Service Charge (%)</label>
              <input
                className="form-input"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={servicePercent}
                onChange={(e) => setServicePercent(e.target.value)}
                required
              />
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--neutral-500)', marginTop: 'var(--space-1)' }}>
                Persentase biaya layanan. Isi 0 jika tidak ingin mengenakan service charge.
              </p>
            </div>

            {/* Preview */}
            <div style={{
              background: 'var(--neutral-50)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              marginTop: 'var(--space-3)',
            }}>
              <p style={{ fontWeight: 600, marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
                📋 Preview (contoh subtotal Rp 100.000)
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: '4px' }}>
                <span>Subtotal</span>
                <span>Rp 100.000</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: '4px' }}>
                <span>Pajak ({parseFloat(taxPercent) || 0}%)</span>
                <span>Rp {((100000 * (parseFloat(taxPercent) || 0)) / 100).toLocaleString('id-ID')}</span>
              </div>
              {parseFloat(servicePercent) > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', marginBottom: '4px' }}>
                  <span>Service Charge ({parseFloat(servicePercent)}%)</span>
                  <span>Rp {((100000 * (parseFloat(servicePercent) || 0)) / 100).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontWeight: 700, fontSize: 'var(--text-base)',
                borderTop: '1px solid var(--neutral-200)', paddingTop: '8px', marginTop: '4px',
              }}>
                <span>Total</span>
                <span style={{ color: 'var(--primary-600)' }}>
                  Rp {(100000 + (100000 * (parseFloat(taxPercent) || 0) / 100) + (100000 * (parseFloat(servicePercent) || 0) / 100)).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          <div className="modal-footer" style={{ borderTop: '1px solid var(--neutral-200)', padding: 'var(--space-4) var(--space-5)' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <HiOutlineSave /> {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SettingsPage;
