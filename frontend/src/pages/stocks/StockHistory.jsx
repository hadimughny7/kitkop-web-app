import { useState, useEffect } from 'react';
import { stockAPI, BACKEND_URL } from '../../services/api';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineChevronDown,
  HiOutlineCube,
  HiOutlineClipboardList,
  HiOutlineTrendingDown,
  HiOutlineTrendingUp,
  HiOutlineRefresh,
  HiOutlineClock,
  HiOutlineUser,
  HiOutlineTable,
} from 'react-icons/hi';
import './StockHistory.css';

/**
 * Returns local date as YYYY-MM-DD string (timezone-safe).
 */
const getLocalDateStr = (d = new Date()) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const StockHistory = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(() => getLocalDateStr());
  const [filterType, setFilterType] = useState('all');
  const [expandedOrders, setExpandedOrders] = useState(new Set());

  useEffect(() => {
    loadData();
  }, [selectedDate, filterType]);

  // Realtime: listen for stock changes via socket
  useEffect(() => {
    const socket = io(BACKEND_URL);

    const handleUpdate = () => {
      // Only auto-refresh if we're viewing today
      if (selectedDate === getLocalDateStr()) {
        loadData();
      }
    };

    socket.on('stock-updated', handleUpdate);
    socket.on('payment-success', handleUpdate);
    socket.on('order-status-update', handleUpdate);

    return () => socket.disconnect();
  }, [selectedDate, filterType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = { date: selectedDate };
      if (filterType !== 'all') params.type = filterType;
      const res = await stockAPI.getLogsByDate(params);
      setData(res.data.data);

      // Auto-expand first 3 orders
      if (res.data.data.byOrder.length > 0) {
        const firstIds = new Set(
          res.data.data.byOrder.slice(0, 3).map((g) => g.order.id)
        );
        setExpandedOrders(firstIds);
      }
    } catch (err) {
      toast.error('Gagal memuat riwayat stok.');
    } finally {
      setLoading(false);
    }
  };

  const navigateDate = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(getLocalDateStr(d));
  };

  const goToToday = () => {
    setSelectedDate(getLocalDateStr());
  };

  const toggleOrder = (orderId) => {
    setExpandedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const formatTime = (dateStr) =>
    new Date(dateStr).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(val || 0);

  const getTypeBadge = (type) => {
    switch (type) {
      case 'auto_deduction':
        return { label: 'Pengurangan', className: 'deduction', icon: '📉' };
      case 'restock':
        return { label: 'Restock', className: 'restock', icon: '📦' };
      case 'manual_reduction':
        return { label: 'Pengurangan Manual', className: 'deduction', icon: '🗑️' };
      case 'refund':
        return { label: 'Refund', className: 'refund', icon: '🔄' };
      case 'manual_adjustment':
        return { label: 'Manual', className: 'manual', icon: '✏️' };
      default:
        return { label: type, className: '', icon: '📋' };
    }
  };

  const getOrderStatusBadge = (status) => {
    const map = {
      pending: 'badge-warning',
      confirmed: 'badge-info',
      preparing: 'badge-primary',
      ready: 'badge-success',
      completed: 'badge-neutral',
      cancelled: 'badge-danger',
    };
    const labels = {
      pending: 'Menunggu',
      confirmed: 'Dikonfirmasi',
      preparing: 'Diproses',
      ready: 'Siap',
      completed: 'Selesai',
      cancelled: 'Batal',
    };
    return {
      className: map[status] || 'badge-neutral',
      label: labels[status] || status,
    };
  };

  const isToday = selectedDate === getLocalDateStr();

  const summary = data?.summary || {
    totalLogs: 0,
    totalDeductions: 0,
    totalRestocks: 0,
    totalRefunds: 0,
    uniqueOrders: 0,
  };

  if (loading && !data) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📊 Riwayat Perubahan Stok</h1>
          <p className="page-subtitle">
            Lihat riwayat perubahan stok bahan baku berdasarkan pesanan per hari
          </p>
        </div>
        <button className="btn btn-secondary" onClick={loadData}>
          <HiOutlineRefresh /> Refresh
        </button>
      </div>

      {/* Date Navigation */}
      <div className="stock-history-date-nav">
        <button className="date-nav-btn" onClick={() => navigateDate(-1)}>
          <HiOutlineChevronLeft />
        </button>

        <div className="date-display">
          <h3>{formatDate(selectedDate)}</h3>
          {isToday && (
            <p style={{ color: 'var(--primary-600)', fontWeight: 600 }}>
              Hari Ini
            </p>
          )}
        </div>

        <button
          className="date-nav-btn"
          onClick={() => navigateDate(1)}
          disabled={isToday}
          style={isToday ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
        >
          <HiOutlineChevronRight />
        </button>

        <div className="date-input-wrapper">
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>

        {!isToday && (
          <button
            className="btn btn-primary btn-sm"
            onClick={goToToday}
            style={{ whiteSpace: 'nowrap' }}
          >
            Hari Ini
          </button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="sh-stats-row">
        <div className="sh-stat-card">
          <div
            className="sh-stat-icon"
            style={{
              background: 'var(--primary-50)',
              color: 'var(--primary-600)',
            }}
          >
            <HiOutlineClipboardList />
          </div>
          <div>
            <p className="sh-stat-value">{summary.uniqueOrders}</p>
            <p className="sh-stat-label">Pesanan</p>
          </div>
        </div>
        <div className="sh-stat-card">
          <div
            className="sh-stat-icon"
            style={{
              background: 'var(--danger-50)',
              color: 'var(--danger-600)',
            }}
          >
            <HiOutlineTrendingDown />
          </div>
          <div>
            <p className="sh-stat-value">{summary.totalDeductions}</p>
            <p className="sh-stat-label">Pengurangan</p>
          </div>
        </div>
        <div className="sh-stat-card">
          <div
            className="sh-stat-icon"
            style={{
              background: 'var(--success-50)',
              color: 'var(--success-600)',
            }}
          >
            <HiOutlineTrendingUp />
          </div>
          <div>
            <p className="sh-stat-value">{summary.totalRestocks}</p>
            <p className="sh-stat-label">Restock</p>
          </div>
        </div>
        <div className="sh-stat-card">
          <div
            className="sh-stat-icon"
            style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}
          >
            <HiOutlineCube />
          </div>
          <div>
            <p className="sh-stat-value">{summary.totalLogs}</p>
            <p className="sh-stat-label">Total Perubahan</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="sh-filter-tabs">
        {[
          { key: 'all', label: '📋 Semua' },
          { key: 'auto_deduction', label: '📉 Pengurangan' },
          { key: 'restock', label: '📦 Restock' },
          { key: 'manual_reduction', label: '🗑️ Pengurangan Manual' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`sh-filter-tab ${filterType === tab.key ? 'active' : ''}`}
            onClick={() => setFilterType(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Order Groups */}
      {data?.byOrder?.length === 0 && data?.nonOrderLogs?.length === 0 ? (
        <div className="sh-empty">
          <span className="empty-icon">📭</span>
          <h3>Tidak ada riwayat perubahan stok</h3>
          <p>Belum ada perubahan stok pada tanggal {formatDate(selectedDate)}</p>
        </div>
      ) : (
        <>
          {data?.byOrder?.map((group) => {
            const order = group.order;
            const isExpanded = expandedOrders.has(order.id);
            const statusBadge = getOrderStatusBadge(order.status);

            return (
              <div key={order.id} className="sh-order-group">
                <div
                  className="sh-order-header"
                  onClick={() => toggleOrder(order.id)}
                >
                  <div className="sh-order-info">
                    <span className="sh-order-number">
                      {order.order_number}
                    </span>
                    <div className="sh-order-meta">
                      <span>
                        <HiOutlineClock /> {formatTime(order.created_at)}
                      </span>
                      {order.customer && (
                        <span>
                          <HiOutlineUser /> {order.customer.name}
                        </span>
                      )}
                      {order.table && (
                        <span>
                          <HiOutlineTable /> Meja {order.table.table_number}
                        </span>
                      )}
                      <span style={{ fontWeight: 600 }}>
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                    <span
                      className={`sh-order-badge badge ${statusBadge.className}`}
                    >
                      {statusBadge.label}
                    </span>
                  </div>
                  <div className="sh-order-right" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <span style={{ fontSize: 'var(--text-sm)', color: 'var(--neutral-500)' }}>
                      {group.logs.length} perubahan
                    </span>
                    <span
                      className={`sh-order-toggle ${isExpanded ? 'expanded' : ''}`}
                    >
                      <HiOutlineChevronDown />
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <table className="sh-items-table">
                    <thead>
                      <tr>
                        <th>Bahan Baku</th>
                        <th>Tipe</th>
                        <th>Perubahan</th>
                        <th>Satuan</th>
                        <th>Catatan</th>
                        <th>Waktu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.logs.map((log) => {
                        const typeBadge = getTypeBadge(log.type);
                        const qty = parseFloat(log.change_qty);
                        return (
                          <tr key={log.id}>
                            <td style={{ fontWeight: 600 }}>
                              {log.rawMaterial?.name || '-'}
                            </td>
                            <td>
                              <span
                                className={`sh-type-badge ${typeBadge.className}`}
                              >
                                {typeBadge.icon} {typeBadge.label}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`sh-change-qty ${qty < 0 ? 'negative' : 'positive'}`}
                              >
                                {qty > 0 ? '+' : ''}
                                {qty}
                              </span>
                            </td>
                            <td>{log.rawMaterial?.unit || '-'}</td>
                            <td style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-xs)' }}>
                              {log.notes || '-'}
                            </td>
                            <td className="sh-time">
                              {formatTime(log.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {/* Non-order logs (restock, manual) */}
          {data?.nonOrderLogs?.length > 0 && (
            <div className="sh-non-order-section">
              <h3>
                🔧 Perubahan Manual (Tanpa Pesanan)
              </h3>
              <div className="sh-order-group">
                <table className="sh-items-table">
                  <thead>
                    <tr>
                      <th>Bahan Baku</th>
                      <th>Tipe</th>
                      <th>Perubahan</th>
                      <th>Satuan</th>
                      <th>Oleh</th>
                      <th>Catatan</th>
                      <th>Waktu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nonOrderLogs.map((log) => {
                      const typeBadge = getTypeBadge(log.type);
                      const qty = parseFloat(log.change_qty);
                      return (
                        <tr key={log.id}>
                          <td style={{ fontWeight: 600 }}>
                            {log.rawMaterial?.name || '-'}
                          </td>
                          <td>
                            <span
                              className={`sh-type-badge ${typeBadge.className}`}
                            >
                              {typeBadge.icon} {typeBadge.label}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`sh-change-qty ${qty < 0 ? 'negative' : 'positive'}`}
                            >
                              {qty > 0 ? '+' : ''}
                              {qty}
                            </span>
                          </td>
                          <td>{log.rawMaterial?.unit || '-'}</td>
                          <td>{log.createdByUser?.name || '-'}</td>
                          <td style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-xs)' }}>
                            {log.notes || '-'}
                          </td>
                          <td className="sh-time">
                            {formatTime(log.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StockHistory;
