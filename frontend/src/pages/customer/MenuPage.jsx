import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { menuAPI, categoryAPI, BACKEND_URL } from '../../services/api';
import { useCart } from '../../context/CartContext';
import { HiOutlineShoppingCart, HiOutlineSearch, HiPlus, HiMinus } from 'react-icons/hi';
import toast from 'react-hot-toast';
import './CustomerPages.css';

const MenuPage = () => {
  const [searchParams] = useSearchParams();
  const tableNum = searchParams.get('table');
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { addItem, removeItem, updateQty, itemCount, items } = useCart();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [menuRes, catRes] = await Promise.all([
        menuAPI.getAll({ available_only: 'true' }),
        categoryAPI.getAll(),
      ]);
      setMenus(menuRes.data.data);
      setCategories(catRes.data.data);
    } catch (err) {
      toast.error('Gagal memuat menu.');
    } finally {
      setLoading(false);
    }
  };

  const filteredMenus = menus.filter((menu) => {
    const matchCategory = activeCategory === 'all' || menu.category_id === parseInt(activeCategory);
    const matchSearch = menu.name.toLowerCase().includes(search.toLowerCase());
    return matchCategory && matchSearch;
  });

  const getCartItem = (menuId) => items.find((item) => item.menu_id === menuId);
  const getCartQty = (menuId) => getCartItem(menuId)?.qty || 0;

  const formatCurrency = (val) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  const getCategoryEmoji = (catName) => {
    if (!catName) return '🍽️';
    const name = catName.toLowerCase();
    if (name.includes('minuman')) return '☕';
    if (name.includes('snack')) return '🍿';
    return '🍛';
  };

  const handleAdd = (menu) => {
    addItem(menu);
    toast.success(`${menu.name} ditambahkan!`, { duration: 1500, icon: '✅' });
  };

  const handleIncrement = (menu) => {
    addItem(menu);
  };

  const handleDecrement = (menuId) => {
    const qty = getCartQty(menuId);
    if (qty <= 1) {
      removeItem(menuId);
      toast('Item dihapus dari keranjang', { duration: 1500, icon: '🗑️' });
    } else {
      updateQty(menuId, qty - 1);
    }
  };

  if (loading) {
    return (
      <div className="customer-page">
        <div className="loading-screen">
          <div className="spinner"></div>
          <p>Memuat menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-page">
      <div className="customer-container">
        <div className="menu-page-header">
          <div className="menu-page-top">
            <h1>Daftar Menu</h1>
            <button className="cart-fab" onClick={() => navigate(`/order/cart?table=${tableNum}`)}>
              <HiOutlineShoppingCart />
              {itemCount > 0 && <span className="cart-badge">{itemCount}</span>}
            </button>
          </div>

          <div className="search-bar" style={{ marginBottom: 'var(--space-3)' }}>
            <HiOutlineSearch className="search-icon" />
            <input
              type="text"
              placeholder="Cari menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="category-tabs">
            <button
              className={`category-tab ${activeCategory === 'all' ? 'active' : ''}`}
              onClick={() => setActiveCategory('all')}
            >
              Semua
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`category-tab ${activeCategory === String(cat.id) ? 'active' : ''}`}
                onClick={() => setActiveCategory(String(cat.id))}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="menu-grid">
          {filteredMenus.map((menu) => {
            const qty = getCartQty(menu.id);
            const inCart = qty > 0;

            return (
              <div key={menu.id} className={`menu-card ${!menu.is_available ? 'unavailable' : ''}`}>
                {menu.image ? (
                  <img
                    src={`${BACKEND_URL}${menu.image}`}
                    alt={menu.name}
                    className="menu-card-img"
                  />
                ) : (
                  <div className="menu-card-img-placeholder">
                    {getCategoryEmoji(menu.category?.name)}
                  </div>
                )}
                <div className="menu-card-body">
                  <p className="menu-card-name">{menu.name}</p>
                  <p className="menu-card-price">{formatCurrency(menu.price)}</p>

                  {inCart ? (
                    <div className="menu-card-qty-control">
                      <button
                        className="menu-qty-btn minus"
                        onClick={() => handleDecrement(menu.id)}
                      >
                        <HiMinus />
                      </button>
                      <span className="menu-qty-value">{qty}</span>
                      <button
                        className="menu-qty-btn plus"
                        onClick={() => handleIncrement(menu)}
                      >
                        <HiPlus />
                      </button>
                    </div>
                  ) : (
                    <button
                      className="menu-card-add"
                      onClick={() => handleAdd(menu)}
                    >
                      + Tambah
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredMenus.length === 0 && (
          <div className="empty-state">
            <span className="empty-icon">🔍</span>
            <h3>Menu tidak ditemukan</h3>
            <p>Coba ubah kata kunci pencarian</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MenuPage;
