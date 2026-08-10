import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tableAPI } from '../../services/api';
import { useCart } from '../../context/CartContext';
import toast from 'react-hot-toast';
import './CustomerPages.css';

const WelcomePage = () => {
  const [searchParams] = useSearchParams();
  const tableNum = searchParams.get('table');
  const [table, setTable] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setTableNumber, setTableId, setCustomerInfo } = useCart();

  useEffect(() => {
    if (!tableNum) {
      setError('Nomor meja tidak ditemukan. Silakan scan QR code yang benar.');
      setLoading(false);
      return;
    }
    loadTable();
  }, [tableNum]);

  const loadTable = async () => {
    try {
      const res = await tableAPI.getByNumber(tableNum);
      setTable(res.data.data);
      setTableNumber(tableNum);
      setTableId(res.data.data.id);
    } catch {
      setError('Meja tidak ditemukan atau tidak aktif.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama wajib diisi.');
      return;
    }

    setCustomerInfo({ name: name.trim(), phone: phone.trim(), email: email.trim() });
    navigate(`/order/menu?table=${tableNum}`);
  };

  if (loading) {
    return (
      <div className="customer-page">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Memuat...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="customer-page">
        <div className="customer-container">
          <div className="error-card">
            <span className="error-icon">😔</span>
            <h2>Oops!</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-page">
      <div className="customer-container">
        <div className="welcome-card">
          <div className="welcome-hero">
            <img src="/logo-kitkop.png" alt="Kitkop.id" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.3)', display: 'block', margin: '0 auto' }} />
            <h1>Selamat Datang di!</h1>
            <p className="welcome-cafe">Kitkop.id</p>
            <div className="table-badge">
              <span>Meja</span>
              <strong>{tableNum}</strong>
            </div>
          </div>

          <form className="welcome-form" onSubmit={handleSubmit}>
            <p className="form-intro">Silakan isi data diri Anda untuk mulai memesan:</p>

            <div className="form-group">
              <label className="form-label" htmlFor="cust-name">Nama *</label>
              <input
                id="cust-name"
                type="text"
                className="form-input"
                placeholder="Masukkan nama Anda"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cust-phone">No. Telepon (opsional)</label>
              <input
                id="cust-phone"
                type="tel"
                className="form-input"
                placeholder="08xxxxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="cust-email">Email (opsional)</label>
              <input
                id="cust-email"
                type="email"
                className="form-input"
                placeholder="email@contoh.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" className="btn btn-primary btn-lg welcome-btn">
              Lihat Daftar Menu 🍽️
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
