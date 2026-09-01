import { useState, useEffect } from 'react';
import { reportAPI } from '../../services/api';
import { HiOutlineShoppingCart, HiOutlineCurrencyDollar, HiOutlineClock, HiOutlineExclamation, HiOutlineCash } from 'react-icons/hi';
import './MainDashboard.css';

const MainDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await reportAPI.getDashboard();
      setStats(res.data.data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0);
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Memuat dashboard...</p>
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
            <span className="welcome-emoji">☕</span>
            <div>
              <h2>Selamat Datang di Kitkop.id</h2>
              <p>Gunakan menu di samping untuk mengelola pesanan, stok bahan baku, dan laporan. Semua data disinkronkan secara real-time.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainDashboard;
