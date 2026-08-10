import { useState, useEffect, useCallback } from 'react';
import { reportAPI } from '../../services/api';
import toast from 'react-hot-toast';
import {
  HiOutlineDownload,
  HiOutlineCurrencyDollar,
  HiOutlineShoppingCart,
  HiOutlineTag,
  HiOutlineExclamation,
  HiOutlineRefresh,
} from 'react-icons/hi';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import './ReportDashboard.css';

const PERIODS = [
  { key: 'daily', label: 'Hari Ini' },
  { key: 'weekly', label: 'Minggu Ini' },
  { key: 'monthly', label: 'Bulan Ini' },
  { key: 'yearly', label: 'Tahun Ini' },
  { key: 'custom', label: 'Custom' },
];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const formatCurrency = (val) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(val || 0);

const formatCurrencyShort = (val) => {
  if (val >= 1_000_000_000) return `Rp${(val / 1_000_000_000).toFixed(1)}M`;
  if (val >= 1_000_000) return `Rp${(val / 1_000_000).toFixed(1)}Jt`;
  if (val >= 1_000) return `Rp${(val / 1_000).toFixed(0)}rb`;
  return `Rp${val}`;
};

const formatNumber = (val) =>
  new Intl.NumberFormat('id-ID').format(val || 0);

const formatDateID = (dateStr) =>
  new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const getStockDisplayStatus = (item) => {
  const stock = parseFloat(item.stock);
  if (stock <= 0) return 'habis';
  if (item.status === 'kritis' || item.status === 'menipis') return item.status;
  return 'aman';
};

const getStockLabel = (status) => {
  if (status === 'aman') return '🟢 Aman';
  if (status === 'menipis') return '🟡 Menipis';
  return '🔴 Habis';
};

const ReportDashboard = () => {
  const [period, setPeriod] = useState('monthly');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [exporting, setExporting] = useState(false);

  const buildParams = useCallback(() => {
    if (period === 'custom' && customStart && customEnd) {
      return { start_date: customStart, end_date: customEnd };
    }
    return { period };
  }, [period, customStart, customEnd]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = buildParams();
      const res = await reportAPI.getReportDashboard(params);
      setData(res.data.data);
    } catch (err) {
      console.error('Failed to load report dashboard:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    if (period === 'custom') {
      if (customStart && customEnd) loadData();
    } else {
      loadData();
    }
  }, [period, customStart, customEnd, loadData]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = buildParams();
      const res = await reportAPI.exportReportDashboard(params);

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;

      const today = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `Laporan_Cafe_Kitkop_${today}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Laporan berhasil didownload');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Gagal export laporan');
    } finally {
      setExporting(false);
    }
  };

  // Format chart data labels
  const formatChartData = () => {
    if (!data?.chartData) return [];
    const effectivePeriod = data.period?.type;

    return data.chartData.map((item) => {
      let displayLabel;
      if (effectivePeriod === 'daily') {
        displayLabel = `${String(item.label).padStart(2, '0')}:00`;
      } else if (effectivePeriod === 'yearly') {
        displayLabel = MONTH_NAMES[parseInt(item.label) - 1] || item.label;
      } else {
        const d = new Date(item.label);
        displayLabel = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      }
      return {
        label: displayLabel,
        revenue: parseFloat(item.revenue) || 0,
        transactions: parseInt(item.transactions) || 0,
      };
    });
  };

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div style={{
          background: 'var(--surface-primary)',
          border: '1px solid var(--neutral-200)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-3) var(--space-4)',
          boxShadow: 'var(--shadow-lg)',
        }}>
          <p style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 'var(--space-1)', color: 'var(--neutral-800)' }}>{label}</p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--primary-600)' }}>
            Penjualan: {formatCurrency(payload[0]?.value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // ============================================
  // RENDER — Skeleton Loading
  // ============================================
  if (loading) {
    return (
      <div className="report-dashboard">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Laporan</h1>
            <p className="page-subtitle">Memuat data laporan...</p>
          </div>
        </div>
        <div className="kpi-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton skeleton-kpi" />
          ))}
        </div>
        <div className="skeleton skeleton-chart" style={{ marginBottom: 'var(--space-6)' }} />
        <div className="two-col">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
        <div className="skeleton skeleton-table" style={{ marginBottom: 'var(--space-6)' }} />
        <div className="skeleton skeleton-table" />
      </div>
    );
  }

  // ============================================
  // RENDER — Error State
  // ============================================
  if (error) {
    return (
      <div className="report-dashboard">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Laporan</h1>
            <p className="page-subtitle">Analisis dan laporan bisnis Kitkop.id</p>
          </div>
        </div>
        <div className="card">
          <div className="error-state">
            <div className="error-icon">⚠️</div>
            <h3>Data laporan gagal dimuat</h3>
            <p>Silakan coba lagi atau periksa koneksi Anda.</p>
            <button className="btn btn-primary" onClick={loadData}>
              <HiOutlineRefresh /> Coba Lagi
            </button>
          </div>
        </div>
      </div>
    );
  }

  const kpi = data?.kpi || {};
  const chartDataFormatted = formatChartData();
  const topMenus = data?.topMenus || [];
  const stockStatus = data?.stockStatus || [];
  const dailySales = data?.dailySales || [];
  const hasData = dailySales.length > 0 || chartDataFormatted.length > 0;

  // ============================================
  // RENDER — Main Dashboard
  // ============================================
  return (
    <div className="report-dashboard">
      {/* ---- Header ---- */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Laporan</h1>
          <p className="page-subtitle">Analisis dan laporan bisnis Kitkop.id</p>
        </div>
        <button
          className="btn btn-export"
          onClick={handleExport}
          disabled={exporting}
          id="btn-export-excel"
        >
          <HiOutlineDownload />
          {exporting ? 'Mengunduh...' : 'Export Excel'}
        </button>
      </div>

      {/* ---- Period Filter ---- */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-body">
          <div className="period-filter">
            <div className="period-pills">
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  className={`period-pill ${period === p.key ? 'active' : ''}`}
                  onClick={() => setPeriod(p.key)}
                  id={`period-${p.key}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {period === 'custom' && (
              <div className="custom-dates">
                <input
                  type="date"
                  className="form-input"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  id="custom-start-date"
                />
                <span>s/d</span>
                <input
                  type="date"
                  className="form-input"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  id="custom-end-date"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- KPI Cards ---- */}
      <div className="kpi-grid">
        <div className="kpi-card" id="kpi-total-penjualan">
          <div className="kpi-icon" style={{ background: 'var(--success-50)', color: 'var(--success-600)' }}>
            <HiOutlineCurrencyDollar />
          </div>
          <div className="kpi-info">
            <p className="kpi-value">{formatCurrencyShort(kpi.totalRevenue)}</p>
            <p className="kpi-label">Total Penjualan</p>
          </div>
        </div>

        <div className="kpi-card" id="kpi-total-transaksi">
          <div className="kpi-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
            <HiOutlineShoppingCart />
          </div>
          <div className="kpi-info">
            <p className="kpi-value">{formatNumber(kpi.totalTransactions)}</p>
            <p className="kpi-label">Total Transaksi</p>
          </div>
        </div>

        <div className="kpi-card" id="kpi-menu-terjual">
          <div className="kpi-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
            <HiOutlineTag />
          </div>
          <div className="kpi-info">
            <p className="kpi-value">{formatNumber(kpi.totalItemsSold)}</p>
            <p className="kpi-label">Menu Terjual</p>
          </div>
        </div>

        <div className="kpi-card" id="kpi-stok-menipis">
          <div className="kpi-icon" style={{
            background: kpi.lowStockCount > 0 ? 'var(--danger-50)' : 'var(--neutral-100)',
            color: kpi.lowStockCount > 0 ? 'var(--danger-600)' : 'var(--neutral-500)',
          }}>
            <HiOutlineExclamation />
          </div>
          <div className="kpi-info">
            <p className="kpi-value">{kpi.lowStockCount || 0}</p>
            <p className="kpi-label">Stok Menipis</p>
            {kpi.outOfStockCount > 0 && (
              <p className="kpi-sub">{kpi.outOfStockCount} stok habis</p>
            )}
          </div>
        </div>
      </div>

      {/* ---- Grafik Penjualan ---- */}
      <div className="card chart-section">
        <div className="card-header">
          <h3 className="section-title">Grafik Penjualan</h3>
        </div>
        <div className="card-body">
          {chartDataFormatted.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDataFormatted} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary-500)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="var(--primary-500)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--neutral-200)" />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'var(--neutral-500)' }}
                  />
                  <YAxis
                    tickFormatter={(val) => formatCurrencyShort(val)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: 'var(--neutral-500)' }}
                    width={80}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--primary-500)"
                    strokeWidth={2.5}
                    fill="url(#colorRevenue)"
                    dot={{ r: 3, fill: 'var(--primary-500)', stroke: 'white', strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: 'var(--primary-600)', stroke: 'white', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📊</div>
              <h3>Belum ada data penjualan</h3>
              <p>Belum ada data penjualan pada periode ini.</p>
            </div>
          )}
        </div>
      </div>

      {/* ---- Menu Terlaris + Status Stok ---- */}
      <div className="two-col">
        {/* Menu Terlaris */}
        <div className="card">
          <div className="card-header">
            <h3 className="section-title">Menu Terlaris</h3>
          </div>
          <div className="card-body">
            {topMenus.length > 0 ? (
              <div className="top-menu-list">
                {topMenus.map((item, idx) => {
                  const rankClass =
                    idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-other';
                  return (
                    <div key={item.menu_id || idx} className="top-menu-item">
                      <div className={`top-menu-rank ${rankClass}`}>{idx + 1}</div>
                      <div className="top-menu-details">
                        <p className="top-menu-name">{item.menu?.name || '-'}</p>
                        <p className="top-menu-revenue">
                          {formatCurrency(parseFloat(item.dataValues?.total_revenue || item.total_revenue || 0))}
                        </p>
                      </div>
                      <span className="top-menu-qty">
                        {formatNumber(parseInt(item.dataValues?.total_qty || item.total_qty || 0))} item
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <p>Belum ada data menu terjual.</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Stok */}
        <div className="card">
          <div className="card-header">
            <h3 className="section-title">Status Stok Bahan Baku</h3>
          </div>
          <div className="card-body">
            {stockStatus.length > 0 ? (
              <div className="stock-status-list">
                {stockStatus.map((item) => {
                  const status = getStockDisplayStatus(item);
                  return (
                    <div key={item.id} className="stock-item">
                      <div className={`stock-indicator ${status}`} />
                      <span className="stock-name">{item.name}</span>
                      <span className="stock-qty">
                        {parseFloat(item.stock)} {item.unit}
                      </span>
                      <span className={`stock-badge ${status}`}>
                        {getStockLabel(status)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-8)' }}>
                <p>Belum ada data bahan baku.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Tabel Laporan Penjualan ---- */}
      <div className="card" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="card-header">
          <h3 className="section-title">Laporan Penjualan</h3>
        </div>
        <div className="card-body">
          {dailySales.length > 0 ? (
            <div className="table-wrapper">
              <table className="data-table" id="tabel-laporan-penjualan">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Tanggal</th>
                    <th style={{ textAlign: 'right' }}>Jumlah Transaksi</th>
                    <th style={{ textAlign: 'right' }}>Menu Terjual</th>
                    <th style={{ textAlign: 'right' }}>Total Penjualan</th>
                  </tr>
                </thead>
                <tbody>
                  {dailySales.map((row, idx) => (
                    <tr key={idx}>
                      <td>{idx + 1}</td>
                      <td>{formatDateID(row.date)}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(row.transaction_count)}</td>
                      <td style={{ textAlign: 'right' }}>{formatNumber(row.items_sold)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(parseFloat(row.total_revenue))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">📋</div>
              <h3>Belum ada data</h3>
              <p>Belum ada data penjualan pada periode ini.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReportDashboard;
