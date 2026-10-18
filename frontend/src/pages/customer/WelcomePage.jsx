import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { tableAPI } from '../../services/api';
import { useCart } from '../../context/useCart';
import toast from 'react-hot-toast';
import { HiOutlineQrcode, HiOutlineArrowRight } from 'react-icons/hi';
import './CustomerPages.css';

const WelcomePage = () => {
  const [searchParams] = useSearchParams();
  const tableNum = searchParams.get('table');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { setTableNumber, setTableId, setCustomerInfo } = useCart();

  useEffect(() => {
    if (!tableNum) return;
    let active = true;
    tableAPI.getByNumber(tableNum).then(res => {
      if (!active) return;
      setTableNumber(tableNum);
      setTableId(res.data.data.id);
      setError('');
    }).catch(() => {
      if (!active) return;
      setError('Meja tidak ditemukan atau tidak aktif.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tableNum, setTableNumber, setTableId]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama wajib diisi.');
      return;
    }

    setCustomerInfo({ name: name.trim(), phone: phone.trim(), email: email.trim() });
    navigate(`/order/menu?table=${tableNum}`);
  };

  if (tableNum && loading) {
    return (
      <div className="customer-page">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Memuat...</p>
        </div>
      </div>
    );
  }

  if (!tableNum || error) {
    return (
      <div className="customer-page">
        <div className="customer-container">
          <div className="error-card">
            <HiOutlineQrcode className="error-icon" aria-hidden="true" />
            <h2>Periksa QR meja Anda</h2>
            <p>{!tableNum ? 'Nomor meja tidak ditemukan. Silakan scan QR code yang benar.' : error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-page welcome-page">
      <div className="customer-container">
        <div className="welcome-card">
          <div className="welcome-hero">
            <img src="/logo-kitkop.png" alt="Kitkop.id" className="welcome-brand" width="64" height="64" />
            <p className="welcome-cafe">KITKOP.ID · PLACE FOR EVERYONE</p>
            <h1>Ngopi dulu.{' '}<br /><span>Cerita kemudian.</span></h1>
            <div className="table-badge">
              <span>Meja</span>
              <strong>{tableNum}</strong>
            </div>
          </div>

          <form className="welcome-form" onSubmit={handleSubmit}>
            <div className="customer-section-heading"><span>01 / MULAI PESAN</span><HiOutlineArrowRight aria-hidden="true" /></div>
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
              Lihat daftar menu <HiOutlineArrowRight aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default WelcomePage;
