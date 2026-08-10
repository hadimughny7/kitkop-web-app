import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { orderAPI, paymentAPI, BACKEND_URL } from '../../services/api';
import { HiCheck, HiOutlineClock } from 'react-icons/hi';
import io from 'socket.io-client';
import toast from 'react-hot-toast';
import './CustomerPages.css';

const statusSteps = [
  { key: 'pending', label: 'Menunggu' },
  { key: 'confirmed', label: 'Dikonfirmasi' },
  { key: 'preparing', label: 'Diproses' },
  { key: 'completed', label: 'Selesai' },
];

const OrderStatusPage = () => {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    loadOrder();
    const socket = io(BACKEND_URL);
    socket.emit('track-order', orderNumber);

    socket.on('order-status-update', (data) => {
      if (data.orderNumber === orderNumber || data.orderId === order?.id) {
        loadOrder();
      }
    });

    socket.on('order-item-update', (data) => {
      if (data.orderNumber === orderNumber || data.orderId === order?.id) {
        loadOrder();
      }
    });

    socket.on('payment-success', (data) => {
      if (data.orderId === order?.id) {
        toast.success('Pembayaran berhasil!');
        loadOrder();
        // Stop polling when payment is confirmed via socket
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    });

    return () => {
      socket.disconnect();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [orderNumber]);

  useEffect(() => {
    if (order && order.status === 'pending') {
      checkOrCreatePayment();
      startPaymentPolling();
    } else {
      // Stop polling if order is no longer pending
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }
  }, [order]);

  const loadOrder = async () => {
    try {
      const res = await orderAPI.track(orderNumber);
      setOrder(res.data.data);
    } catch (err) {
      console.error('Failed to load order:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkingPayment = useRef(false);

  const checkOrCreatePayment = async () => {
    if (!order) return;
    if (checkingPayment.current) return;
    checkingPayment.current = true;
    try {
      const res = await paymentAPI.getStatus(order.id);
      setPayment(res.data.data);

      // If status check reveals payment was already made, reload order
      if (res.data.data.status === 'paid') {
        loadOrder();
      }
    } catch (err) {
      if (err.response?.status === 404) {
        try {
          const createRes = await paymentAPI.createQris({ order_id: order.id });
          setPayment(createRes.data.data);
        } catch (createErr) {
          console.error('Failed to create QRIS:', createErr);
        }
      }
    } finally {
      checkingPayment.current = false;
    }
  };

  // Poll payment status every 5 seconds as fallback for webhook
  const startPaymentPolling = () => {
    if (pollIntervalRef.current) return; // Already polling

    pollIntervalRef.current = setInterval(async () => {
      if (!order) return;
      try {
        const res = await paymentAPI.getStatus(order.id);
        setPayment(res.data.data);
        if (res.data.data.status === 'paid') {
          toast.success('Pembayaran berhasil!');
          loadOrder();
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 5000);
  };

  const handleSimulatePayment = async () => {
    if (!order) return;
    try {
      await paymentAPI.simulatePay(order.id);
      toast.success('Pembayaran berhasil disimulasikan!');
      loadOrder();
    } catch (err) {
      toast.error('Gagal simulasi pembayaran');
    }
  };

  const getStepState = (stepKey) => {
    if (!order) return '';
    if (order.status === 'cancelled') return '';
    if (order.status === 'completed') return 'completed';
    const currentIdx = statusSteps.findIndex((s) => s.key === order.status);
    const stepIdx = statusSteps.findIndex((s) => s.key === stepKey);
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return '';
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);

  // === Compute estimated time ===
  const getEstimatedMinutes = () => {
    if (!order?.items) return 0;
    const activeItems = order.items.filter(i => i.status !== 'rejected' && i.status !== 'completed');
    let totalMinutes = 0;
    for (const item of activeItems) {
      const perItem = item.item_type === 'minuman' ? 5 : 8;
      totalMinutes += perItem * item.qty;
    }
    return totalMinutes;
  };

  // === Item progress stats ===
  const getItemProgress = () => {
    if (!order?.items) return { total: 0, completed: 0, pct: 0 };
    const active = order.items.filter(i => i.status !== 'rejected');
    const completed = active.filter(i => i.status === 'completed');
    const pct = active.length > 0 ? Math.round((completed.length / active.length) * 100) : 0;
    return { total: active.length, completed: completed.length, pct };
  };

  // === Item status icon ===
  const getItemIcon = (item) => {
    if (item.status === 'completed') return '✅';
    if (item.status === 'preparing') return '🔥';
    if (item.status === 'rejected') return '❌';
    return '⏳';
  };

  if (loading) {
    return (
      <div className="customer-page">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Memuat status pesanan...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="customer-page">
        <div className="customer-container">
          <div className="error-card">
            <span className="error-icon">😔</span>
            <h2>Pesanan Tidak Ditemukan</h2>
          </div>
        </div>
      </div>
    );
  }

  const estimatedMinutes = getEstimatedMinutes();
  const progress = getItemProgress();

  // Determine QR source: use qr_url from Midtrans, fallback to qris_content
  const qrImageUrl = payment?.qr_url || null;
  const isMidtransQr = qrImageUrl && !qrImageUrl.startsWith('mock-');
  const isFallbackMock = payment?.qris_content?.startsWith('mock-');

  return (
    <div className="customer-page order-status-page">
      <div className="customer-container">
        <div className="status-card">
          <div className="status-header">
            <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: 'var(--space-3)' }}>
              {order.status === 'completed' ? '🎉' : order.status === 'cancelled' ? '❌' : '⏳'}
            </span>
            <h1>
              {order.status === 'completed' ? 'Pesanan Selesai!' :
               order.status === 'cancelled' ? 'Pesanan Dibatalkan' :
               order.status === 'pending' ? 'Menunggu Pembayaran' :
               'Pesanan Sedang Diproses'}
            </h1>
            <p className="status-order-num">{order.order_number}</p>

            {/* Estimated time — show when order is being processed */}
            {['confirmed', 'preparing'].includes(order.status) && estimatedMinutes > 0 && (
              <div className="est-time-badge">
                <HiOutlineClock /> Estimasi: ~{estimatedMinutes} menit
              </div>
            )}
          </div>

          <div className="status-body">
            {order.status === 'pending' && (
              <div style={{ background: 'var(--neutral-50)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', textAlign: 'center', marginBottom: 'var(--space-6)', border: '1px solid var(--neutral-200)' }}>
                <h3 style={{ marginBottom: 'var(--space-2)' }}>Selesaikan Pembayaran</h3>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--neutral-500)', marginBottom: 'var(--space-4)' }}>Scan QRIS di bawah ini untuk membayar pesanan Anda sejumlah <strong>{formatCurrency(order.total)}</strong></p>
                <div style={{ background: '#fff', padding: '16px', display: 'inline-block', borderRadius: '12px', border: '1px solid var(--neutral-200)', marginBottom: 'var(--space-4)' }}>
                  {isMidtransQr ? (
                    <img
                      src={qrImageUrl}
                      alt="QRIS Payment QR Code"
                      style={{ width: 220, height: 220, objectFit: 'contain' }}
                    />
                  ) : isFallbackMock ? (
                    <div style={{ width: 200, padding: 'var(--space-4)', background: '#fee2e2', borderRadius: '8px', color: '#b91c1c', textAlign: 'left' }}>
                      <p style={{ fontWeight: 600, marginBottom: '8px', fontSize: '14px' }}>❌ Midtrans Error (402)</p>
                      <p style={{ fontSize: '12px' }}>Midtrans Core API untuk QRIS di akun Sandbox Anda belum diaktifkan. Silakan hubungi Midtrans atau aktifkan dari dashboard.</p>
                    </div>
                  ) : (
                    <div style={{ width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--neutral-100)', borderRadius: '8px', flexDirection: 'column', gap: '8px' }}>
                      <div className="spinner" style={{ width: 32, height: 32 }}></div>
                      <span style={{ fontSize: '13px', color: 'var(--neutral-500)' }}>Memuat QRIS...</span>
                    </div>
                  )}
                </div>
                {isMidtransQr && (
                  <p style={{ fontSize: '12px', color: 'var(--neutral-400)', marginBottom: 'var(--space-3)' }}>
                    Gunakan GoPay, OVO, DANA, atau aplikasi e-wallet lainnya
                  </p>
                )}

                {/* Polling indicator */}
                {isMidtransQr && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: 'var(--space-3)' }}>
                    <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }}></div>
                    <span style={{ fontSize: '12px', color: 'var(--neutral-400)' }}>Menunggu pembayaran...</span>
                  </div>
                )}

                <div>
                  <button className="btn btn-primary" onClick={handleSimulatePayment} style={{ width: '100%' }}>Simulasikan Pembayaran Berhasil</button>
                  <p style={{ fontSize: '11px', color: 'var(--neutral-400)', marginTop: '8px' }}>*Tombol ini hanya untuk simulasi testing (Dev Mode)</p>
                </div>
              </div>
            )}

            {order.status !== 'cancelled' && order.status !== 'pending' && (
              <div className="status-tracker">
                {statusSteps.map((step) => (
                  <div key={step.key} className={`status-step ${getStepState(step.key)}`}>
                    <div className="status-dot">
                      {getStepState(step.key) === 'completed' ? <HiCheck /> : <HiOutlineClock />}
                    </div>
                    <span className="status-step-label">{step.label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar — show during preparation */}
            {['preparing'].includes(order.status) && progress.total > 0 && (
              <div className="customer-progress-section">
                <div className="customer-progress-header">
                  <span>Progress Pesanan</span>
                  <span className="customer-progress-pct">{progress.pct}%</span>
                </div>
                <div className="customer-progress-bar">
                  <div className="customer-progress-fill" style={{ width: `${progress.pct}%` }}></div>
                </div>
                <p className="customer-progress-text">{progress.completed} dari {progress.total} item selesai</p>
              </div>
            )}

            {/* Items with checkmarks */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', marginBottom: 'var(--space-3)' }}>Detail Pesanan</h3>
              <div className="customer-items-list">
                {order.items?.map((item) => (
                  <div key={item.id} className={`customer-item-row customer-item-${item.status}`}>
                    <span className="customer-item-icon">{getItemIcon(item)}</span>
                    <div className="customer-item-info">
                      <span className="customer-item-name">{item.menu?.name} × {item.qty}</span>
                      {item.notes && <span className="customer-item-notes">{item.notes}</span>}
                    </div>
                    <span className="customer-item-price">{formatCurrency(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--neutral-200)', paddingTop: 'var(--space-3)' }}>
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="summary-row">
                <span>Pajak (10%)</span>
                <span>{formatCurrency(order.tax)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderStatusPage;
