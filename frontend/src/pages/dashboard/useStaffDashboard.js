import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { BACKEND_URL, orderAPI } from '../../services/api';
import { buildStaffSummary, fetchAllOrders, getWibDate } from './staffDashboardData';

export default function useStaffDashboard(isCashier) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const reloadRef = useRef(null);
  const reload = useCallback(() => reloadRef.current?.(), []);

  useEffect(() => {
    let disposed = false;
    let busy = false;
    let queued = false;
    let refreshTimer;

    const load = async () => {
      if (busy) { queued = true; return; }
      busy = true;
      setRefreshing(true);
      do {
        queued = false;
        try {
          const [todayOrders, confirmed, preparing] = await Promise.all([
            fetchAllOrders(orderAPI.getAll, { date: getWibDate() }),
            isCashier ? Promise.resolve([]) : fetchAllOrders(orderAPI.getAll, { status: 'confirmed' }),
            isCashier ? Promise.resolve([]) : fetchAllOrders(orderAPI.getAll, { status: 'preparing' }),
          ]);
          if (!disposed) {
            setSummary(buildStaffSummary({ todayOrders, activeOrders: [...confirmed, ...preparing] }));
            setUpdatedAt(new Date());
            setError('');
          }
        } catch {
          if (!disposed) setError('Data dashboard belum dapat diperbarui. Silakan coba lagi.');
        }
      } while (queued && !disposed);
      busy = false;
      if (!disposed) setRefreshing(false);
    };

    const scheduleRefresh = () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(load, 250);
    };
    const handleVisibility = () => { if (!document.hidden) scheduleRefresh(); };
    const socket = io(BACKEND_URL);
    ['connect', 'new-order', 'payment-success', 'order-status-update', 'order-item-update'].forEach((event) => {
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
  }, [isCashier]);

  return { summary, error, refreshing, updatedAt, reload };
}
