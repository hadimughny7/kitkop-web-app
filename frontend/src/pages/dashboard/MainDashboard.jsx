import { useState, useEffect, useCallback, useRef } from 'react';
import LoadingState from '../../components/LoadingState';
import { reportAPI } from '../../services/api';
import { createStaffSocket } from '../../services/socket';
import { HiOutlineShoppingCart, HiOutlineCurrencyDollar, HiOutlineClock, HiOutlineExclamation, HiOutlineCash, HiOutlineArrowRight } from 'react-icons/hi';
import './MainDashboard.css';

const MainDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const reloadRef = useRef(null);
  const loadDashboard = useCallback(() => reloadRef.current?.(), []);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let queued = false;
    let refreshTimer;

    const load = async () => {
      if (disposed) return;
      if (busy) { queued = true; return; }
      busy = true;
      do {
        queued = false;
        try {
          const res = await reportAPI.getDashboard();
          if (!disposed) { setStats(res.data.data); setLoadError(false); }
        } catch {
          if (!disposed) setLoadError(true);
        }
      } while (queued && !disposed);
      busy = false;
      if (!disposed) setLoading(false);
    };

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(load, 250);
    };
    const handleVisibility = () => { if (!document.hidden) scheduleRefresh(); };
    const socket = createStaffSocket();
    ['connect', 'new-order', 'payment-success', 'order-status-update', 'order-item-update', 'stock-updated'].forEach(event => {
      socket.on(event, scheduleRefresh);
    });
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(scheduleRefresh, 60000);
    reloadRef.current = load;
    load();

    return () => {
      disposed = true;
      clearTimeout(refreshTimer);
      clearInterval(interval);
      reloadRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibility);
      socket.disconnect();
    };
  }, []);

  const retryLoad = () => {
    setLoading(true);
    setLoadError(false);
    loadDashboard();
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0);
  };

  if (loading) return <LoadingState>Memuat dashboard...</LoadingState>;

  if (loadError) {
    return (
      <div className="main-dashboard">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
        </div>
        <div className="empty-state">
          <p role="alert">Data dashboard gagal dimuat. Periksa koneksi lalu coba lagi.</p>
          <button className="btn btn-primary" onClick={retryLoad}>Coba lagi</button>
        </div>
      </div>
    );
  }

  return (
    <div className="main-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Ringkasan operasional hari ini</p>
        </div>
      </div>

      <div className="dashboard-brand-banner">
        <div><p className="banner-eyebrow">KITKOP.ID / DAILY OVERVIEW</p><h2>Hari baru.{' '}<br /><span>Cerita baru.</span></h2><p>Semua aktivitas kedai, dalam satu pandangan.</p></div>
        <div className="dashboard-brand-mark" aria-hidden="true"><img src="/logo-kitkop.png" alt="" width="100" height="100" /><span>PLACE FOR<br />EVERYONE.</span><HiOutlineArrowRight /></div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
            <HiOutlineShoppingCart />
          </div>
          <div>
            <p className="stat-value">{stats?.todayOrders || 0}</p>
            <p className="stat-label">Pesanan Hari Ini</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-50)', color: 'var(--success-600)' }}>
            <HiOutlineCurrencyDollar />
          </div>
          <div>
            <p className="stat-value">{formatCurrency(stats?.todayRevenue)}</p>
            <p className="stat-label">Pendapatan Hari Ini</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-50)', color: 'var(--warning-600)' }}>
            <HiOutlineCash />
          </div>
          <div>
            <p className="stat-value">{formatCurrency(stats?.todayCash)}</p>
            <p className="stat-label">Total Uang Cash Hari Ini</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
            <HiOutlineClock />
          </div>
          <div>
            <p className="stat-value">{stats?.activeOrders || 0}</p>
            <p className="stat-label">Pesanan Aktif</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: stats?.lowStock > 0 ? 'var(--warning-50)' : 'var(--neutral-100)', color: stats?.lowStock > 0 ? 'var(--warning-600)' : 'var(--neutral-500)' }}>
            <HiOutlineExclamation />
          </div>
          <div>
            <p className="stat-value">{stats?.lowStock || 0}</p>
            <p className="stat-label">Stok Menipis</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon" style={{ background: stats?.criticalStock > 0 ? 'var(--danger-50)' : 'var(--neutral-100)', color: stats?.criticalStock > 0 ? 'var(--danger-600)' : 'var(--neutral-500)' }}>
            <HiOutlineExclamation />
          </div>
          <div>
            <p className="stat-value">{stats?.criticalStock || 0}</p>
            <p className="stat-label">Stok Habis</p>
          </div>
        </div>
      </div>

      <div className="dashboard-welcome-card card">
        <div className="card-body">
          <div className="welcome-content">
            <HiOutlineArrowRight className="welcome-emoji" aria-hidden="true" />
            <div>
              <h2>Ruang kerja kedai Anda.</h2>
              <p>Gunakan menu di samping untuk mengelola pesanan, stok bahan baku, dan laporan. Semua data disinkronkan secara real-time.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;
