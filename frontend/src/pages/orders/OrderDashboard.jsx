import { useState, useEffect, useRef } from 'react';
import { orderAPI, paymentAPI, BACKEND_URL } from '../../services/api';
import toast from 'react-hot-toast';
import {
  HiOutlineCash,
  HiOutlineSearch,
  HiOutlineClipboardList,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlinePrinter,
  HiOutlineEye,
} from 'react-icons/hi';
import { io } from 'socket.io-client';
import { playNotificationSound, initAudioContext } from '../../utils/notificationSound';
import './OrderDashboard.css';

const OrderDashboard = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  // Helper: get local date as YYYY-MM-DD (WIB, not UTC)
  const getLocalDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const [dateFilter, setDateFilter] = useState(getLocalDate());

  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailOrder, setDetailOrder] = useState(null);

  // For receipt printing
  const [printOrder, setPrintOrder] = useState(null);
  const receiptRef = useRef(null);

  useEffect(() => {
    loadOrders().then(() => setLoading(false));
  }, []);

  const loadOrders = async () => {
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.order_type = typeFilter;
      if (dateFilter) params.date = dateFilter;
      params.limit = 200;
      const res = await orderAPI.getAll(params);
      setOrders(res.data.data);
    } catch (err) {
      toast.error('Gagal memuat pesanan.');
    }
  };

  useEffect(() => {
    loadOrders();
  }, [search, statusFilter, typeFilter, dateFilter]);

  // Initialize audio context on first user interaction
  useEffect(() => {
    const handleClick = () => initAudioContext();
    document.addEventListener('click', handleClick, { once: true });
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    const socket = io(BACKEND_URL);
    socket.emit('join-role', 'admin');

    socket.on('new-order', () => {
      setTimeout(() => loadOrders(), 300);
    });
    socket.on('order-status-update', () => setTimeout(() => loadOrders(), 300));
    socket.on('payment-success', () => {
      playNotificationSound();
      setTimeout(() => loadOrders(), 300);
    });

    return () => socket.disconnect();
  }, []);

  const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);
  const formatDate = (date) =>
    new Date(date).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const formatDateFull = (date) =>
    new Date(date).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const statusColors = {
    pending: 'badge-warning',
    confirmed: 'badge-info',
    preparing: 'badge-primary',
    ready: 'badge-success',
    completed: 'badge-neutral',
    cancelled: 'badge-danger',
  };

  const statusLabels = {
    pending: 'Menunggu',
    confirmed: 'Dikonfirmasi',
    preparing: 'Diproses',
    ready: 'Siap',
    completed: 'Selesai',
    cancelled: 'Batal',
  };

  const handleUpdateStatus = async (id, status) => {
    try {
      await orderAPI.updateStatus(id, status);
      toast.success('Status pesanan diperbarui.');
      loadOrders();
    } catch (err) {
      toast.error('Gagal update status.');
    }
  };

  // ===== Print Receipt =====
  const handlePrintReceipt = (order) => {
    setPrintOrder(order);
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // Compute stats
  const totalOrders = orders.length;
  const activeOrders = orders.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)).length;
  const completedOrders = orders.filter((o) => o.status === 'completed').length;
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;

  // Apply search client-side
  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      o.order_number?.toLowerCase().includes(s) ||
      o.customer?.name?.toLowerCase().includes(s) ||
      o.customer?.phone?.includes(s)
    );
  });

  if (loading)
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
      </div>
    );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard Pesanan</h1>
          <p className="page-subtitle">Kelola semua pesanan pelanggan (QR & Kasir)</p>
        </div>
      </div>

      {/* Stats */}
      <div className="order-stats-row no-print">
        <div className="order-stat-card">
          <div className="order-stat-icon" style={{ background: 'var(--primary-50)', color: 'var(--primary-600)' }}>
            <HiOutlineClipboardList />
          </div>
          <div>
            <p className="order-stat-value">{totalOrders}</p>
            <p className="order-stat-label">Total Pesanan</p>
          </div>
        </div>
        <div className="order-stat-card">
          <div className="order-stat-icon" style={{ background: 'var(--info-50)', color: 'var(--info-600)' }}>
            <HiOutlineClock />
          </div>
          <div>
            <p className="order-stat-value">{activeOrders}</p>
            <p className="order-stat-label">Pesanan Aktif</p>
          </div>
        </div>
        <div className="order-stat-card">
          <div className="order-stat-icon" style={{ background: 'var(--success-50)', color: 'var(--success-600)' }}>
            <HiOutlineCheckCircle />
          </div>
          <div>
            <p className="order-stat-value">{completedOrders}</p>
            <p className="order-stat-label">Selesai</p>
          </div>
        </div>
        <div className="order-stat-card">
          <div className="order-stat-icon" style={{ background: 'var(--danger-50)', color: 'var(--danger-600)' }}>
            <HiOutlineXCircle />
          </div>
          <div>
            <p className="order-stat-value">{cancelledOrders}</p>
            <p className="order-stat-label">Batal</p>
          </div>
        </div>
      </div>

      {/* Order Table Card */}
      <div className="card no-print">
        <div className="card-header">
          <h3 style={{ fontSize: 'var(--text-lg)' }}>Daftar Pesanan</h3>
          <div className="order-filters">
            <div className="order-search-wrapper">
              <HiOutlineSearch className="search-icon" />
              <input
                type="text"
                placeholder="Cari pesanan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select className="form-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">Semua Status</option>
              <option value="pending">Menunggu</option>
              <option value="confirmed">Dikonfirmasi</option>
              <option value="preparing">Diproses</option>
              <option value="ready">Siap</option>
              <option value="completed">Selesai</option>
              <option value="cancelled">Batal</option>
            </select>
            <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="all">Semua Tipe</option>
              <option value="qr">📱 QR</option>
              <option value="kasir">🏪 Kasir</option>
            </select>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                className="form-select"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{ cursor: 'pointer' }}
              />
              {dateFilter && dateFilter !== getLocalDate() && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDateFilter(getLocalDate())}
                  title="Kembali ke hari ini"
                  style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                >
                  Hari Ini
                </button>
              )}
              {dateFilter && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setDateFilter('')}
                  title="Tampilkan semua tanggal"
                  style={{ whiteSpace: 'nowrap', fontSize: '12px' }}
                >
                  Semua
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Waktu</th>
                <th>Pelanggan</th>
                <th>Meja</th>
                <th>Tipe</th>
                <th>Kasir</th>
                <th>Total</th>
                <th>Status</th>
                <th>Pembayaran</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong style={{ color: 'var(--primary-600)' }}>{o.order_number}</strong>
                  </td>
                  <td>{formatDate(o.created_at)}</td>
                  <td>{o.customer?.name}</td>
                  <td>{o.table?.table_number || '-'}</td>
                  <td>
                    <span className={`badge ${o.order_type === 'kasir' ? 'badge-primary' : 'badge-info'}`}>
                      {o.order_type === 'kasir' ? '🏪 Kasir' : '📱 QR'}
                    </span>
                  </td>
                  <td>{o.cashier?.name || '-'}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(o.total)}</td>
                  <td>
                    <span className={`badge ${statusColors[o.status]}`}>{statusLabels[o.status]}</span>
                  </td>
                  <td>
                    {o.transaction?.status === 'paid' ? (
                      <span className="badge badge-success">Lunas ({o.transaction?.payment_method})</span>
                    ) : (
                      <span className="badge badge-warning">Belum Bayar</span>
                    )}
                  </td>
                  <td>
                    <div className="order-actions">

                      {o.status === 'ready' && (
                        <button className="btn btn-success btn-sm" onClick={() => handleUpdateStatus(o.id, 'completed')}>
                          Selesai
                        </button>
                      )}
                      {o.transaction?.status !== 'paid' && o.status !== 'cancelled' && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setSelectedOrder(o);
                            setShowPayModal(true);
                          }}
                        >
                          <HiOutlineCash /> Bayar
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => { setDetailOrder(o); setShowDetailModal(true); }}>
                        <HiOutlineEye /> Detail
                      </button>
                      <button className="btn-print" onClick={() => handlePrintReceipt(o)}>
                        <HiOutlinePrinter /> Struk
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--neutral-500)' }}>
                    Tidak ada pesanan ditemukan.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pay Modal */}
      {showPayModal && selectedOrder && (
        <div className="modal-overlay no-print" onClick={() => setShowPayModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Pembayaran Kasir</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPayModal(false)}>
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                <h3 style={{ fontSize: 'var(--text-2xl)', color: 'var(--primary-600)', marginBottom: 'var(--space-2)' }}>
                  {formatCurrency(selectedOrder.total)}
                </h3>
                <p>Order: {selectedOrder.order_number}</p>
              </div>
              <button
                className="btn btn-success btn-lg"
                style={{ width: '100%' }}
                onClick={async () => {
                  try {
                    await paymentAPI.payCash(selectedOrder.id);
                    toast.success('Pembayaran tunai berhasil dicatat.');
                    setShowPayModal(false);
                    loadOrders();
                  } catch (err) {
                    toast.error(err.response?.data?.message || 'Gagal memproses pembayaran');
                  }
                }}
              >
                Konfirmasi Pembayaran Tunai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Order Modal */}
      {showDetailModal && detailOrder && (
        <div className="modal-overlay no-print" onClick={() => setShowDetailModal(false)}>
          <div className="modal-content" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Detail Pesanan</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowDetailModal(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ padding: 'var(--space-4)' }}>
              {/* Order info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <p style={{ fontWeight: 700, color: 'var(--primary-600)', fontSize: 'var(--text-lg)' }}>{detailOrder.order_number}</p>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--neutral-500)' }}>{formatDateFull(detailOrder.created_at)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className={`badge ${statusColors[detailOrder.status]}`}>{statusLabels[detailOrder.status]}</span>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--neutral-500)', marginTop: '4px' }}>{detailOrder.order_type === 'kasir' ? '🏪 Kasir' : '📱 QR'}</p>
                </div>
              </div>

              {/* Customer info */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h4 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)', textTransform: 'uppercase', color: 'var(--neutral-500)', letterSpacing: '0.5px' }}>Data Pemesan</h4>
                <div style={{ background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-sm)' }}>Nama</span>
                    <span style={{ fontWeight: 600 }}>{detailOrder.customer?.name || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-sm)' }}>No. Telepon</span>
                    <span style={{ fontWeight: 500 }}>{detailOrder.customer?.phone || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-sm)' }}>Email</span>
                    <span style={{ fontWeight: 500 }}>{detailOrder.customer?.email || '-'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--neutral-500)', fontSize: 'var(--text-sm)' }}>Meja</span>
                    <span style={{ fontWeight: 500 }}>{detailOrder.table?.table_number || 'Takeaway'}</span>
                  </div>
                </div>
              </div>

              {/* Items */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <h4 style={{ marginBottom: 'var(--space-2)', fontSize: 'var(--text-sm)', textTransform: 'uppercase', color: 'var(--neutral-500)', letterSpacing: '0.5px' }}>Daftar Pesanan</h4>
                <div style={{ border: '1px solid var(--neutral-200)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  {detailOrder.items?.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: idx < detailOrder.items.length - 1 ? '1px solid var(--neutral-100)' : 'none' }}>
                      <div>
                        <p style={{ fontWeight: 500 }}>{item.menu?.name || `Item #${item.menu_id}`}</p>
                        <p style={{ fontSize: '12px', color: 'var(--neutral-500)' }}>{item.qty} × {formatCurrency(item.price)}</p>
                        {item.notes && <p style={{ fontSize: '12px', color: 'var(--warning-600)', marginTop: '2px' }}>📝 {item.notes}</p>}
                      </div>
                      <span style={{ fontWeight: 600 }}>{formatCurrency(item.qty * parseFloat(item.price))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals */}
              <div style={{ background: 'var(--neutral-50)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: 'var(--text-sm)' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(detailOrder.subtotal)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: 'var(--text-sm)' }}>
                  <span>Pajak (10%)</span>
                  <span>{formatCurrency(detailOrder.tax)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 'var(--text-lg)', borderTop: '1px solid var(--neutral-200)', paddingTop: '8px', marginTop: '4px' }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--primary-600)' }}>{formatCurrency(detailOrder.total)}</span>
                </div>
              </div>

              {/* Payment status */}
              <div style={{ textAlign: 'center', marginTop: 'var(--space-3)' }}>
                {detailOrder.transaction?.status === 'paid' ? (
                  <span className="badge badge-success" style={{ fontSize: 'var(--text-sm)', padding: '6px 16px' }}>✅ Lunas — {detailOrder.transaction.payment_method}</span>
                ) : (
                  <span className="badge badge-warning" style={{ fontSize: 'var(--text-sm)', padding: '6px 16px' }}>⏳ Belum Dibayar</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================
          RECEIPT PRINT TEMPLATE (hidden, only visible on print)
          ============================================ */}
      {printOrder && (
        <div className="receipt-container" ref={receiptRef}>
          <div className="receipt-header">
            <h2>KITKOP.ID</h2>
            <p>Jl. Contoh Alamat No. 123</p>
            <p>Telp: (021) 123-4567</p>
          </div>

          <div className="receipt-info">
            <div className="receipt-info-row">
              <span>No. Pesanan:</span>
              <span>{printOrder.order_number}</span>
            </div>
            <div className="receipt-info-row">
              <span>Tanggal:</span>
              <span>{formatDateFull(printOrder.created_at)}</span>
            </div>
            <div className="receipt-info-row">
              <span>Pelanggan:</span>
              <span>{printOrder.customer?.name || '-'}</span>
            </div>
            <div className="receipt-info-row">
              <span>Meja:</span>
              <span>{printOrder.table?.table_number || 'Takeaway'}</span>
            </div>
            <div className="receipt-info-row">
              <span>Tipe:</span>
              <span>{printOrder.order_type === 'kasir' ? 'Kasir' : 'QR Order'}</span>
            </div>
            {printOrder.cashier && (
              <div className="receipt-info-row">
                <span>Kasir:</span>
                <span>{printOrder.cashier.name}</span>
              </div>
            )}
          </div>

          <div className="receipt-items">
            <div className="receipt-items-header">
              <span>Item</span>
              <span>Total</span>
            </div>
            {printOrder.items?.map((item, idx) => (
              <div key={idx} className="receipt-item">
                <div className="receipt-item-name">{item.menu?.name || `Item #${item.menu_id}`}</div>
                <div className="receipt-item-detail">
                  <span>
                    {item.qty} x {formatCurrency(item.price)}
                  </span>
                  <span>{formatCurrency(item.qty * parseFloat(item.price))}</span>
                </div>
                {item.notes && <div className="receipt-item-notes">Catatan: {item.notes}</div>}
              </div>
            ))}
          </div>

          <div className="receipt-totals">
            <div className="receipt-total-row">
              <span>Subtotal</span>
              <span>{formatCurrency(printOrder.subtotal)}</span>
            </div>
            <div className="receipt-total-row">
              <span>Pajak (10%)</span>
              <span>{formatCurrency(printOrder.tax)}</span>
            </div>
            <div className="receipt-total-row grand-total">
              <span>TOTAL</span>
              <span>{formatCurrency(printOrder.total)}</span>
            </div>
          </div>

          <div className="receipt-payment">
            {printOrder.transaction?.status === 'paid'
              ? `LUNAS — ${printOrder.transaction.payment_method}`
              : 'BELUM DIBAYAR'}
          </div>

          <div className="receipt-footer">
            <p>Terima kasih atas kunjungan Anda!</p>
            <p>Selamat menikmati ☕</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDashboard;
