import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { settingAPI } from '../services/api';

const CartContext = createContext(null);

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
};

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([]);
  const [tableNumber, setTableNumber] = useState('');
  const [tableId, setTableId] = useState(null);
  const [customerInfo, setCustomerInfo] = useState({ name: '', phone: '', email: '' });
  const [taxPercent, setTaxPercent] = useState(10);
  const [servicePercent, setServicePercent] = useState(0);

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await settingAPI.getAll();
        const data = res.data.data;
        if (data.tax_percentage !== undefined) setTaxPercent(parseFloat(data.tax_percentage));
        if (data.service_charge_percentage !== undefined) setServicePercent(parseFloat(data.service_charge_percentage));
      } catch (err) {
        // Fallback to defaults silently
      }
    };
    fetchSettings();
  }, []);

  const addItem = useCallback((menu) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.menu_id === menu.id);
      if (existing) {
        return prev.map((item) =>
          item.menu_id === menu.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [
        ...prev,
        {
          menu_id: menu.id,
          name: menu.name,
          price: parseFloat(menu.price),
          image: menu.image,
          qty: 1,
          notes: '',
          category: menu.category?.name || '',
        },
      ];
    });
  }, []);

  const removeItem = useCallback((menuId) => {
    setItems((prev) => prev.filter((item) => item.menu_id !== menuId));
  }, []);

  const updateQty = useCallback((menuId, qty) => {
    if (qty <= 0) {
      removeItem(menuId);
      return;
    }
    setItems((prev) =>
      prev.map((item) => (item.menu_id === menuId ? { ...item, qty } : item))
    );
  }, [removeItem]);

  const updateNotes = useCallback((menuId, notes) => {
    setItems((prev) =>
      prev.map((item) => (item.menu_id === menuId ? { ...item, notes } : item))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const tax = Math.round(subtotal * (taxPercent / 100));
  const serviceCharge = Math.round(subtotal * (servicePercent / 100));
  const total = subtotal + tax + serviceCharge;
  const itemCount = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        tableNumber,
        tableId,
        customerInfo,
        subtotal,
        tax,
        serviceCharge,
        total,
        itemCount,
        taxPercent,
        servicePercent,
        setTableNumber,
        setTableId,
        setCustomerInfo,
        addItem,
        removeItem,
        updateQty,
        updateNotes,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
