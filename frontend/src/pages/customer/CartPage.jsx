import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { orderAPI } from '../../services/api';
import { HiOutlineArrowLeft, HiOutlineTrash } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useState } from 'react';
import './CustomerPages.css';

const CartPage = () => {
  const [searchParams] = useSearchParams();
  const tableNum = searchParams.get('table');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const {
    items, subtotal, tax, total, tableId, customerInfo,
    updateQty, updateNotes, removeItem, clearCart,
  } = useCart();

  const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  const handleCheckout = async () => {
    if (items.length === 0) {
      toast.error('Keranjang masih kosong.');
      return;
    }

    setLoading(true);
    try {
      const orderData = {
        table_id: tableId,
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email,
        order_type: 'qr',
        items: items.map((item) => ({
          menu_id: item.menu_id,
          qty: item.qty,
          notes: item.notes,
        })),
      };

      const res = await orderAPI.create(orderData);
      const order = res.data.data;

      clearCart();
      toast.success('Pesanan berhasil dibuat!');
      navigate(`/order/status/${order.order_number}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Gagal membuat pesanan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="customer-page cart-page">
      <div className="customer-container">
        <div className="cart-header">
          <button className="back-btn" onClick={() => navigate(`/order/menu?table=${tableNum}`)}>
            <HiOutlineArrowLeft />
          </button>
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700 }}>Keranjang</h1>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--neutral-500)' }}>
              Meja {tableNum} • {items.length} item
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🛒</span>
            <h3>Keranjang Kosong</h3>
            <p>Tambahkan menu dari daftar menu</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: 'var(--space-4)' }}
              onClick={() => navigate(`/order/menu?table=${tableNum}`)}
            >
              Lihat Menu
            </button>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {items.map((item) => (
                <div key={item.menu_id} className="cart-item">
                  <div className="cart-item-img-placeholder">🍽️</div>
                  <div className="cart-item-info">
                    <p className="cart-item-name">{item.name}</p>
                    <p className="cart-item-price">{formatCurrency(item.price)}</p>
                    <div className="qty-control">
                      <button className="qty-btn" onClick={() => updateQty(item.menu_id, item.qty - 1)}>−</button>
                      <span className="qty-value">{item.qty}</span>
                      <button className="qty-btn" onClick={() => updateQty(item.menu_id, item.qty + 1)}>+</button>
                    </div>
                    <div className="cart-item-notes">
                      <input
                        type="text"
                        placeholder="Catatan (opsional)"
                        value={item.notes}
                        onChange={(e) => updateNotes(item.menu_id, e.target.value)}
                      />
                    </div>
                  </div>
                  <button className="cart-item-remove" onClick={() => removeItem(item.menu_id)}>
                    <HiOutlineTrash />
                  </button>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              <div className="summary-row">
                <span>Pajak (10%)</span>
                <span>{formatCurrency(tax)}</span>
              </div>
              <div className="summary-row total">
                <span>Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
              <button
                className="btn btn-primary btn-lg checkout-btn"
                onClick={handleCheckout}
                disabled={loading}
              >
                {loading ? 'Memproses...' : `Pesan Sekarang — ${formatCurrency(total)}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CartPage;
