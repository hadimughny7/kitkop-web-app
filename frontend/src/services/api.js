import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('kitkop_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('kitkop_token');
      localStorage.removeItem('kitkop_user');
      if (window.location.pathname.startsWith('/dashboard') || 
          window.location.pathname.startsWith('/staff')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ============================================
// AUTH
// ============================================
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

// ============================================
// USERS
// ============================================
export const userAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// ============================================
// MENUS
// ============================================
export const menuAPI = {
  getAll: (params) => api.get('/menus', { params }),
  getById: (id) => api.get(`/menus/${id}`),
  create: (formData) => api.post('/menus', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id, formData) => api.put(`/menus/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/menus/${id}`),
  toggleAvailability: (id) => api.patch(`/menus/${id}/availability`),
};

// ============================================
// CATEGORIES
// ============================================
export const categoryAPI = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

// ============================================
// TABLES
// ============================================
export const tableAPI = {
  getAll: () => api.get('/tables'),
  getById: (id) => api.get(`/tables/${id}`),
  getByNumber: (num) => api.get(`/tables/by-number/${num}`),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  delete: (id) => api.delete(`/tables/${id}`),
  bulkToggle: (isActive) => api.patch('/tables/bulk-toggle', { is_active: isActive }),
};

// ============================================
// ORDERS
// ============================================
export const orderAPI = {
  create: (data) => api.post('/orders', data),
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  track: (orderNumber) => api.get(`/orders/track/${orderNumber}`),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  updateStationStatus: (id, data) => api.patch(`/orders/${id}/station-status`, data),
  rejectItem: (orderId, itemId) => api.patch(`/orders/${orderId}/items/${itemId}/reject`),
  updateItemStatus: (orderId, itemId, status) => api.patch(`/orders/${orderId}/items/${itemId}/status`, { status }),
  processAllItems: (orderId) => api.patch(`/orders/${orderId}/items/process-all`),
  completeAllItems: (orderId) => api.patch(`/orders/${orderId}/items/complete-all`),
};

// ============================================
// STOCKS
// ============================================
export const stockAPI = {
  getAll: (params) => api.get('/stocks', { params }),
  create: (data) => api.post('/stocks', data),
  update: (id, data) => api.put(`/stocks/${id}`, data),
  delete: (id) => api.delete(`/stocks/${id}`),
  restock: (id, data) => api.post(`/stocks/${id}/restock`, data),
  reduce: (id, data) => api.post(`/stocks/${id}/reduce`, data),
  getLogs: (params) => api.get('/stocks/logs', { params }),
  getLogsByDate: (params) => api.get('/stocks/logs/by-date', { params }),
};

// ============================================
// RECIPES
// ============================================
export const recipeAPI = {
  getAll: (params) => api.get('/recipes', { params }),
  create: (data) => api.post('/recipes', data),
  update: (id, data) => api.put(`/recipes/${id}`, data),
  delete: (id) => api.delete(`/recipes/${id}`),
};

// ============================================
// PAYMENTS
// ============================================
export const paymentAPI = {
  createQris: (data) => api.post('/payments/create-qris', data),
  getStatus: (orderId) => api.get(`/payments/${orderId}/status`),
  simulatePay: (orderId) => api.post(`/payments/${orderId}/simulate-pay`),
  payCash: (orderId) => api.post(`/payments/${orderId}/cash`),
};

// ============================================
// REPORTS
// ============================================
export const reportAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getOrders: (params) => api.get('/reports/orders', { params }),
  getStocks: (params) => api.get('/reports/stocks', { params }),
  exportOrders: (params) => api.get('/reports/orders/export', { params, responseType: 'blob' }),
  exportStocks: (params) => api.get('/reports/stocks/export', { params, responseType: 'blob' }),
  getReportDashboard: (params) => api.get('/reports/report-dashboard', { params }),
  exportReportDashboard: (params) => api.get('/reports/report-dashboard/export', { params, responseType: 'blob' }),
};

export default api;
