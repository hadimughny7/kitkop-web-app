import { optionText } from '../../utils/menuOptions';
import { Link } from 'react-router-dom';
import { HiOutlineArrowRight, HiOutlineCash, HiOutlineCheckCircle, HiOutlineClipboardList, HiOutlineClock, HiOutlineRefresh, HiOutlineShoppingCart } from 'react-icons/hi';
import useStaffDashboard from './useStaffDashboard';
import './StaffDashboard.css';

const currency = (value) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
}).format(value);
const time = (value) => new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
}).format(new Date(value));
const statusLabels = { confirmed: 'Antrean masuk', preparing: 'Diproses', completed: 'Selesai' };
const statusBadges = { confirmed: 'badge-neutral', preparing: 'badge-info', completed: 'badge-success' };

function Metric({ label, value, icon }) {
  return (
    <div className="staff-metric">
      <span className="staff-metric-icon" aria-hidden="true">{icon}</span>
      <p className="staff-metric-value">{value}</p>
      <p className="staff-metric-label">{label}</p>
    </div>
  );
}

function OrderList({ orders, emptyText, limit = 6 }) {
  if (orders.length === 0) return <p className="staff-empty-state">{emptyText}</p>;
  return (
    <ul className="staff-order-list">
      {orders.slice(0, limit).map((order) => (
        <li key={order.id}>
          <div className="staff-order-heading">
            <strong>{order.order_number}</strong>
            <span className={`badge ${statusBadges[order.status]}`}>{statusLabels[order.status]}</span>
          </div>
          <p className="staff-order-meta">{order.table ? `Meja ${order.table.table_number}` : 'Takeaway'} · {order.customer?.name || 'Pelanggan'} · {time(order.created_at)} WIB</p>
          <p className="staff-order-items">{(order.items || []).filter((item) => item.status !== 'rejected').slice(0, 3)
            .map((item) => `${item.qty}× ${item.menu?.name || 'Menu'}${optionText(item) ? ` (${optionText(item)})` : ''}`).join(', ')}
            {(order.items || []).filter((item) => item.status !== 'rejected').length > 3 && ' · dan menu lainnya'}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function StaffDashboard({ role }) {
  const isCashier = role === 'kasir';
  const { summary, error, refreshing, updatedAt, reload } = useStaffDashboard(isCashier);
  const title = isCashier ? 'Dashboard Kasir' : 'Dashboard Dapur & Barista';

  return (
    <div className="staff-dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{isCashier ? 'Pantau pesanan, pembayaran, dan pelayanan kedai.' : 'Pantau antrean makanan, snack, dan minuman yang sudah dibayar.'}</p>
        </div>
        <div className="staff-refresh">
          {updatedAt && <span>Terakhir diperbarui {time(updatedAt)} WIB</span>}
          <button className="btn btn-secondary btn-sm" onClick={reload} disabled={refreshing}>
            <HiOutlineRefresh aria-hidden="true" /> {refreshing ? 'Memperbarui...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="staff-dashboard-error" role="alert">{error}{summary && ' Menampilkan data terakhir yang berhasil dimuat.'}</div>}
      {!summary && !error && <div className="loading-screen"><div className="spinner" /><p>Memuat ringkasan operasional...</p></div>}

      {summary && (
        <>
          <div className="staff-shortcuts">
            <div>
              <p className="staff-section-label">{isCashier ? 'KASIR / PELAYANAN' : 'DAPUR & BARISTA / PRODUKSI'}</p>
              <h2>{isCashier ? 'Siap menerima pesanan.' : 'Dari antrean, ke meja pelanggan.'}</h2>
              <p>{isCashier ? 'Catat pesanan dan terima pembayaran melalui POS.' : 'Buka antrean untuk mulai memproses atau menyelesaikan item.'}</p>
            </div>
            <div className="staff-shortcut-actions">
              <Link className="btn staff-primary-link" to={isCashier ? '/dashboard/kasir' : '/dashboard/kitchen'}>
                {isCashier ? <HiOutlineShoppingCart aria-hidden="true" /> : <HiOutlineClipboardList aria-hidden="true" />}
                {isCashier ? 'Buka POS' : 'Buka Antrean'} <HiOutlineArrowRight aria-hidden="true" />
              </Link>
              <Link className="staff-secondary-link" to={isCashier ? '/dashboard/orders' : '/dashboard/stocks'}>
                {isCashier ? 'Kelola pesanan' : 'Cek stok bahan'} <HiOutlineArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className={`staff-metrics${isCashier ? '' : ' staff-metrics-production'}`}>
            {isCashier ? (
              <>
                <Metric label="Pesanan hari ini" value={summary.todayCount} icon={<HiOutlineClipboardList />} />
                <Metric label="Nilai pesanan lunas hari ini" value={currency(summary.paidTotal)} icon={<HiOutlineCash />} />
              </>
            ) : (
              <>
                <Metric label="Pesanan antrean masuk" value={summary.incomingCount} icon={<HiOutlineClipboardList />} />
                <Metric label="Pesanan sedang diproses" value={summary.preparingCount} icon={<HiOutlineClock />} />
                <Metric label="Pesanan selesai dari pesanan hari ini" value={summary.completedOrderCount} icon={<HiOutlineCheckCircle />} />
              </>
            )}
          </div>

          <div className={`staff-dashboard-columns${isCashier ? ' staff-dashboard-columns-single' : ''}`}>
            {!isCashier && (
              <section className="card" aria-label="Antrean produksi">
                <div className="card-header">
                  <div><h2>Antrean produksi</h2><p>Pesanan lunas, diurutkan dari yang paling awal masuk.</p></div>
                  <span className="badge badge-neutral">{summary.queue.length} pesanan</span>
                </div>
                <OrderList orders={summary.queue} limit={8} emptyText="Belum ada pesanan lunas yang perlu disiapkan." />
                <div className="card-footer"><Link to="/dashboard/kitchen">
                  Kelola seluruh antrean <HiOutlineArrowRight aria-hidden="true" />
                </Link></div>
              </section>
            )}

            <div className="staff-dashboard-column">
              {isCashier ? (
                <section className="card" aria-label="Ringkasan pembayaran">
                  <div className="card-header"><div><h2>Pembayaran pesanan hari ini</h2><p>Dari pesanan yang dibuat hari ini dan sudah lunas.</p></div></div>
                  <dl className="staff-payment-breakdown">
                    <div><dt>Tunai</dt><dd>{currency(summary.cashTotal)}</dd></div>
                    <div><dt>QRIS</dt><dd>{currency(summary.qrisTotal)}</dd></div>
                    {summary.otherTotal > 0 && <div><dt>Metode lainnya</dt><dd>{currency(summary.otherTotal)}</dd></div>}
                    <div className="staff-payment-total"><dt>Total lunas</dt><dd>{currency(summary.paidTotal)}</dd></div>
                  </dl>
                  <p className="staff-panel-note">{summary.paidCount} pesanan lunas. Pesanan dibatalkan tidak disertakan.</p>
                </section>
              ) : (
                <>
                  <section className="card" aria-label="Pesanan selesai">
                    <div className="card-header">
                      <div><h2>Pesanan selesai</h2><p>Pesanan yang dibuat hari ini dan sudah selesai.</p></div>
                      <span className="badge badge-neutral">{summary.completedOrderCount} pesanan</span>
                    </div>
                    <div className="staff-completed-orders" tabIndex={0} role="region" aria-label="Daftar pesanan selesai">
                      <OrderList orders={summary.completedOrders} limit={summary.completedOrders.length} emptyText="Belum ada pesanan yang selesai dari pesanan hari ini." />
                    </div>
                  </section>
                </>
              )}
            </div>
          </div>
          <p className="staff-dashboard-footnote">Ringkasan harian mengikuti waktu WIB.{!isCashier && ' Antrean aktif tetap mencakup pesanan dari hari sebelumnya.'}</p>
        </>
      )}
    </div>
  );
}
