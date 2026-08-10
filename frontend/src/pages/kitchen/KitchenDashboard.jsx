import { useState, useEffect, useCallback } from 'react';
import { orderAPI } from '../../services/api';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import { HiOutlineClock, HiOutlineCheck, HiOutlineX, HiOutlineRefresh, HiCheck, HiVolumeOff } from 'react-icons/hi';
import { startNotificationAlert, stopNotificationAlert, isAlertRinging, initAudioContext } from '../../utils/notificationSound';
import './StationDashboard.css';

const KitchenDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [activeTab, setActiveTab] = useState('confirmed');
  const [loading, setLoading] = useState(true);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const handleClick = () => initAudioContext();
    document.addEventListener('click', handleClick, { once: true });
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    loadOrders();
    const socket = io('http://localhost:5000');
    socket.emit('join-room', 'kitchen');

    socket.on('new-order', () => {
      loadOrders();
    });

    socket.on('payment-success', () => {
      loadOrders();
      startNotificationAlert(3000);
      toast('💰 Pembayaran diterima, pesanan siap diproses!', { icon: '🔔' });
    });

    socket.on('order-status-update', () => loadOrders());
    socket.on('order-item-update', () => loadOrders());

    return () => {
      socket.disconnect();
      stopNotificationAlert();
    };
  }, []);

  // Auto-stop alert when no confirmed orders remain
  useEffect(() => {
    const confirmedCount = orders.filter(o => o.status === 'confirmed').length;
    if (confirmedCount === 0 && isAlertRinging()) {
      stopNotificationAlert();
    }
  }, [orders]);

  const loadOrders = async () => {
    try {
      const res = await orderAPI.getAll({ limit: 50 });
      setOrders(res.data.data);
    } catch (err) {
      console.error('Failed:', err);
    } finally {
      setLoading(false);
    }
  };

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
    return false;
  });

  const countByStatus = (status) =>
    orders.filter((o) => o.status === status).length;

  const formatTime = (date) => new Date(date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  // Get item status info
  const getItemStatusInfo = (item) => {
    if (item.status === 'completed') return { label: 'Selesai', className: 'item-completed', icon: '✅' };
    if (item.status === 'preparing') return { label: 'Diproses', className: 'item-preparing', icon: '🔥' };
    if (item.status === 'rejected') return { label: 'Ditolak', className: 'item-rejected', icon: '❌' };
    return { label: 'Menunggu', className: 'item-pending', icon: '⏳' };
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
          <h1 className="page-title">🍳 Kitchen Dashboard</h1>
          <p className="page-subtitle">Kelola pesanan makanan & snack</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {isAlertRinging() && (
            <button className="btn btn-danger btn-sm alert-dismiss-btn" onClick={() => { stopNotificationAlert(); loadOrders(); }}>
              <HiVolumeOff /> Matikan Notifikasi
            </button>
          )}
          <button className="btn btn-secondary" onClick={loadOrders}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>
      </div>

      <div className="station-stats">
        <div className="mini-stat" onClick={() => setActiveTab('confirmed')}>
          <span className="mini-stat-value">{countByStatus('confirmed')}</span>
          <span className="mini-stat-label">Masuk</span>
        </div>
        <div className="mini-stat" onClick={() => setActiveTab('preparing')}>
          <span className="mini-stat-value">{countByStatus('preparing')}</span>
          <span className="mini-stat-label">Diproses</span>
        </div>
      </div>

      <div className="tabs" style={{ marginBottom: 'var(--space-4)' }}>
        {['confirmed', 'preparing'].map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'confirmed' ? '📥 Masuk' :
             tab === 'preparing' ? '🔥 Diproses' : ''}
          </button>
        ))}
      </div>

      <div className="order-cards-grid">
        {filteredOrders.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <h3>Tidak ada pesanan</h3>
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
                              {item.status === 'pending' && (
                                <button
                                    className="item-btn item-btn-process"
                                    onClick={() => handleItemStatus(order.id, item.id, 'preparing')}
                                    title="Proses item ini"
                                  >
                                    🔥 Proses
                                  </button>
                              )}
                              {item.status === 'preparing' && (
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
                          {item.notes && <span className="item-notes">📝 {item.notes}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="order-card-actions">
                  {/* Bulk actions */}
                  {order.status === 'confirmed' && (
                    <button className="btn btn-primary btn-sm" onClick={() => handleProcessAll(order.id)}>
                      🔥 Proses Semua
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
