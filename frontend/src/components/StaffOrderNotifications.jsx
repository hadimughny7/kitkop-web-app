import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import { HiOutlineBell, HiVolumeOff } from 'react-icons/hi';
import { BACKEND_URL } from '../services/api';
import { initAudioContext, startNotificationAlert, stopNotificationAlert } from '../utils/notificationSound';
import './StaffOrderNotifications.css';

// Mounted by the authenticated dashboard layout, so route changes do not reset alerts.
const StaffOrderNotifications = () => {
  const [pendingCount, setPendingCount] = useState(0);
  const pendingOrders = useRef(new Set());

  useEffect(() => {
    const socket = io(BACKEND_URL);
    const notifiedOrders = new Set();
    const toastIds = new Set();
    const unlockAudio = () => initAudioContext();

    document.addEventListener('click', unlockAudio);
    document.addEventListener('keydown', unlockAudio);

    socket.on('payment-success', (data) => {
      if (data?.orderId == null) return;
      const orderId = String(data.orderId);
      if (notifiedOrders.has(orderId)) return;

      notifiedOrders.add(orderId);
      pendingOrders.current.add(orderId);
      setPendingCount(pendingOrders.current.size);
      startNotificationAlert(3000);

      const toastId = `staff-paid-order-${orderId}`;
      toastIds.add(toastId);
      toast.success('Pembayaran diterima, pesanan siap diproses!', {
        id: toastId,
        duration: 5000,
      });
    });

    socket.on('order-status-update', (data) => {
      if (!['preparing', 'ready', 'completed', 'cancelled'].includes(data?.status)) return;
      if (!pendingOrders.current.delete(String(data.orderId))) return;

      setPendingCount(pendingOrders.current.size);
      if (pendingOrders.current.size === 0) stopNotificationAlert();
    });

    const trackedOrders = pendingOrders.current;
    return () => {
      socket.disconnect();
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
      stopNotificationAlert();
      trackedOrders.clear();
      toastIds.forEach((id) => toast.dismiss(id));
    };
  }, []);

  const dismissAlert = () => {
    pendingOrders.current.clear();
    setPendingCount(0);
    stopNotificationAlert();
  };

  if (pendingCount === 0) return null;

  return (
    <div className="staff-order-notification">
      <div className="staff-order-notification-message" role="status">
        <HiOutlineBell aria-hidden="true" />
        <span><strong>{pendingCount} pesanan sudah dibayar.</strong> Siap diproses oleh dapur & barista.</span>
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={dismissAlert}>
        <HiVolumeOff aria-hidden="true" /> Matikan Notifikasi
      </button>
    </div>
  );
};

export default StaffOrderNotifications;
