import { useState, useEffect, useCallback } from 'react';
import { orderAPI, BACKEND_URL } from '../../services/api';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import { HiOutlineClock, HiOutlineCheck, HiOutlineX, HiOutlineRefresh, HiCheck, HiOutlineInbox } from 'react-icons/hi';
import './StationDashboard.css';
import { fetchAllOrders, getWibDate } from '../dashboard/staffDashboardData';

const KitchenDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('confirmed');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    try {
      const [incoming, preparing, completed] = await Promise.all([
        fetchAllOrders(orderAPI.getAll, { status: 'confirmed' }),
        fetchAllOrders(orderAPI.getAll, { status: 'preparing' }),
        fetchAllOrders(orderAPI.getAll, { status: 'completed', date: getWibDate() }),
      ]);
      setOrders([...incoming, ...preparing, ...completed]);
      setError('');
    } catch {
      setError('Pesanan belum dapat diperbarui. Silakan tekan Refresh.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const socket = io(BACKEND_URL);
    socket.emit('join-room', 'kitchen');

    socket.on('new-order', () => {
      loadOrders();
    });

    socket.on('payment-success', () => loadOrders());

    socket.on('order-status-update', () => loadOrders());
    socket.on('order-item-update', () => loadOrders());

    return () => {
      socket.disconnect();
    };
  }, [loadOrders]);

  // === Per-item status update ===
  const handleItemStatus = async (orderId, itemId, status) => {
    try {
      await orderAPI.updateItemStatus(orderId, itemId, status);
      toast.success(status === 'preparing' ? 'Item mulai diproses' : 'Item selesai ✓');
      loadOrders();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal update status item');
    }
  };

  // === Bulk: Process all items ===
  const handleProcessAll = async (orderId) => {
    try {
      await orderAPI.processAllItems(orderId);
      toast.success('Semua item mulai diproses');
      loadOrders();
    } catch (err) {
      toast.error('Gagal memproses semua item');
    }
  };

  // === Bulk: Complete all items ===
  const handleCompleteAll = async (orderId) => {
    try {
      await orderAPI.completeAllItems(orderId);
      toast.success('Semua item selesai! ✓');
      loadOrders();
    } catch (err) {
      toast.error('Gagal menyelesaikan semua item');
    }
  };

  const handleRejectItem = async (orderId, itemId) => {
    if (!window.confirm('Apakah Anda yakin ingin menolak menu ini?')) return;
    try {
      await orderAPI.rejectItem(orderId, itemId);
      toast.success('Menu berhasil ditolak');
      loadOrders();
    } catch (err) {
      toast.error('Gagal menolak menu');
    }
  };

  const filteredOrders = orders.filter((order) => {
    if (activeTab === 'confirmed') return order.status === 'confirmed';
    if (activeTab === 'preparing') return order.status === 'preparing';
    if (activeTab === 'completed') return order.status === 'completed';
    return false;
  });

  const countByStatus = (status) =>
    orders.filter((o) => o.status === status).length;

  const formatTime = (date) => new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // Get item status info
  const getItemStatusInfo = (item) => {
    if (item.status === 'completed') return { label: 'Selesai', className: 'item-completed', icon: <HiOutlineCheck aria-hidden="true" /> };
    if (item.status === 'preparing') return { label: 'Diproses', className: 'item-preparing', icon: <HiOutlineRefresh aria-hidden="true" /> };
    if (item.status === 'rejected') return { label: 'Ditolak', className: 'item-rejected', icon: <HiOutlineX aria-hidden="true" /> };
    return { label: 'Menunggu', className: 'item-pending', icon: <HiOutlineClock aria-hidden="true" /> };
  };

  // Count item statuses in an order
  const getOrderItemStats = (order) => {
    const items = order.items || [];
    const active = items.filter(i => i.status !== 'rejected');
    const completed = items.filter(i => i.status === 'completed');
    const preparing = items.filter(i => i.status === 'preparing');
    const pending = items.filter(i => i.status === 'pending');
    return { total: active.length, completed: completed.length, preparing: preparing.length, pending: pending.length };
  };

  if (loading) {
    return <div className="loading-screen"><div className="spinner"></div><p>Memuat...</p></div>;
  }

  return (
    <div className="station-dashboard">
      <div className="station-header">
        <div>
          <h1 className="page-title">Dapur & Barista</h1>
          <p className="page-subtitle">Kelola pesanan makanan, snack, dan minuman</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button className="btn btn-secondary" onClick={loadOrders}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      <div className="station-stats">
        <div className="mini-stat" onClick={() => setActiveTab('confirmed')}>
          <span className="mini-stat-value">{countByStatus('confirmed')}</span>
          <span className="mini-stat-label">Masuk</span>
        </div>
        <div className="mini-stat" onClick={() => setActiveTab('preparing')}>
          <span className="mini-stat-value">{countByStatus('preparing')}</span>
          <span className="mini-stat-label">Diproses</span>
        </div>
        <button type="button" className="mini-stat" onClick={() => setActiveTab('completed')}>
          <span className="mini-stat-value">{countByStatus('completed')}</span>
          <span className="mini-stat-label">Selesai</span>
        </button>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
        {['confirmed', 'preparing', 'completed'].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            aria-pressed={activeTab === tab}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'confirmed' ? 'Masuk' :
             tab === 'preparing' ? 'Diproses' : 'Selesai'}
          </button>
        ))}
      </div>

      <div className="order-cards-grid">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
          <HiOutlineInbox className="empty-icon" aria-hidden="true" />
            <h3>{activeTab === 'completed' ? 'Belum ada pesanan selesai' : 'Tidak ada pesanan'}</h3>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const stats = getOrderItemStats(order);
            const progressPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

            return (
              <div key={order.id} className="order-card card">
                <div className="order-card-header">
                  <div>
                    <span className="order-number">{order.order_number}</span>
                    <span className="order-table">Meja {order.table?.table_number || '-'}</span>
                  </div>
                  <span className="order-time">
                    <HiOutlineClock /> {formatTime(order.created_at)}
                  </span>
                </div>

                {/* Progress bar */}
                {order.status === 'preparing' && stats.total > 0 && (
                  <div className="item-progress-bar-container">
                    <div className="item-progress-bar">
                      <div className="item-progress-fill" style={{ width: `${progressPct}%` }}></div>
                    </div>
                    <span className="item-progress-text">{stats.completed}/{stats.total} selesai</span>
                  </div>
                )}

                <div className="order-card-body">
                  <p className="order-customer">{order.customer?.name}</p>
                  <ul className="order-items-list">
                    {order.items?.map((item) => {
                      const info = getItemStatusInfo(item);
                      return (
                        <li key={item.id} className={`order-item-row ${info.className}`}>
                          <div className="item-main-row">
                            {/* Status icon */}
                            <span className="item-status-icon">{info.icon}</span>
                            <span className="item-qty">{item.qty}×</span>
                            <span className="item-name">{item.menu?.name}</span>

                            {/* Per-item action buttons */}
                            <div className="item-action-btns">
                              {order.status !== 'completed' && item.status === 'pending' && (
                                <button
                                    className="item-btn item-btn-process"
                                    onClick={() => handleItemStatus(order.id, item.id, 'preparing')}
                                    title="Proses item ini"
                                  >
                            Proses
                                  </button>
                              )}
                              {order.status !== 'completed' && item.status === 'preparing' && (
                                <button
                                  className="item-btn item-btn-done"
                                  onClick={() => handleItemStatus(order.id, item.id, 'completed')}
                                  title="Selesaikan item ini"
                                >
                                  <HiCheck /> Selesai
                                </button>
                              )}
                            </div>
                          </div>
                      {item.notes && <span className="item-notes">Catatan: {item.notes}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="order-card-actions">
                  {order.status === 'completed' && <span className="badge badge-success"><HiOutlineCheck aria-hidden="true" /> Selesai</span>}
                  {/* Bulk actions */}
                  {order.status === 'confirmed' && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleProcessAll(order.id)}>
                        Proses Semua
                    </button>
                  )}
                  {order.status === 'preparing' && (
                    <button className="btn btn-success btn-sm" onClick={() => handleCompleteAll(order.id)}>
                      <HiOutlineCheck /> Selesaikan Semua
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default KitchenDashboard;
