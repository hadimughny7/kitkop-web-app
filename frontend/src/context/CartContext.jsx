import { makeCartItem, addCartLine, replaceCartLine } from '../utils/menuOptions';
import { useState, useCallback, useEffect } from 'react';
import { CartContext } from './cartStore';
import { settingAPI } from '../services/api';

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
      } catch {
        // Fallback to defaults silently
      }
    };
    fetchSettings();
  }, []);

  const addItem = useCallback((menu, selections = [], notes = '') => {
    setItems((prev) => addCartLine(prev, makeCartItem(menu, selections, notes)));
  }, []);
  const removeItem = useCallback((id) => setItems((prev) => prev.filter((item) => item.line_id !== id)), []);
  const updateQty = useCallback((id, qty) => {
    setItems((prev) => qty <= 0 ? prev.filter((i) => i.line_id !== id) : prev.map((i) => i.line_id === id ? { ...i, qty } : i));
  }, []);
  const updateNotes = useCallback((id, notes) => setItems((prev) => prev.map((i) => i.line_id === id ? { ...i, notes } : i)), []);
  const updateOptions = useCallback((id, menu, selections, notes) => setItems((prev) => replaceCartLine(prev, id, makeCartItem(menu, selections, notes))), []);

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
        updateOptions,
        clearCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};
