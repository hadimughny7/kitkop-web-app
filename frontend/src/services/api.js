import axios from 'axios';
import { rememberOrderTracking, getOrderTrackingToken } from './orderTracking';
import { getOrderSessionToken, rememberOrderSession } from './orderSession';

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const API_BASE_URL = `${BACKEND_URL}/api`;

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
    const currentToken = localStorage.getItem('kitkop_token');
    const requestToken = error.config?.headers?.Authorization;
    if (error.response?.status === 401 && (!currentToken || requestToken === `Bearer ${currentToken}`)) {
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

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
};

export const userAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

export const menuAPI = {
  getAll: (params) => api.get('/menus', { params }),
  getById: (id) => api.get(`/menus/${id}`),
  getOptions: (id) => api.get(`/menus/${id}/options`),
  setOptionAvailability: (id, groupId, choiceId, is_available) => api.patch(`/menus/${id}/options/${groupId}/choices/${choiceId}/availability`, { is_available }),
  create: (formData) => api.post('/menus', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id, formData) => api.put(`/menus/${id}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id) => api.delete(`/menus/${id}`),
  toggleAvailability: (id) => api.patch(`/menus/${id}/availability`),
};

export const categoryAPI = {
  getAll: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
};

export const tableAPI = {
  getAll: () => api.get('/tables'),
  getById: (id) => api.get(`/tables/${id}`),
  getByNumber: (num) => api.get(`/tables/by-number/${num}`),
  create: (data) => api.post('/tables', data),
  update: (id, data) => api.put(`/tables/${id}`, data),
  delete: (id) => api.delete(`/tables/${id}`),
  bulkToggle: (isActive) => api.patch('/tables/bulk-toggle', { is_active: isActive }),
};

export const orderAPI = {
  create: async (data) => {
    const sessionToken = getOrderSessionToken();
    try {
      const response = await api.post('/orders', data, {
        headers: sessionToken ? { 'X-Order-Session': sessionToken } : {},
      });
      rememberOrderSession(response.headers['x-order-session']);
      rememberOrderTracking(response.data.data);
      return response;
    } catch (error) {
      rememberOrderSession(error.response?.headers?.['x-order-session']);
      throw error;
    }
  },
  getAll: (params) => api.get('/orders', { params }),
  getById: (id) => api.get(`/orders/${id}`),
  track: (orderNumber) => api.get(`/orders/track/${encodeURIComponent(orderNumber)}`, {
    headers: { 'X-Order-Tracking-Token': getOrderTrackingToken(orderNumber) || '' },
  }),
  updateStatus: (id, status) => api.patch(`/orders/${id}/status`, { status }),
  updateStationStatus: (id, data) => api.patch(`/orders/${id}/station-status`, data),
  rejectItem: (orderId, itemId) => api.patch(`/orders/${orderId}/items/${itemId}/reject`),
  updateItemStatus: (orderId, itemId, status) => api.patch(`/orders/${orderId}/items/${itemId}/status`, { status }),
  processAllItems: (orderId) => api.patch(`/orders/${orderId}/items/process-all`),
  completeAllItems: (orderId) => api.patch(`/orders/${orderId}/items/complete-all`),
};

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

export const recipeAPI = {
  getAll: (params) => api.get('/recipes', { params }),
  create: (data) => api.post('/recipes', data),
  update: (id, data) => api.put(`/recipes/${id}`, data),
  delete: (id) => api.delete(`/recipes/${id}`),
};

const paymentAccess = orderNumber => orderNumber === undefined ? {} : {
  headers: { 'X-Order-Tracking-Token': getOrderTrackingToken(orderNumber) || '' },
};

export const paymentAPI = {
  createQris: (data, orderNumber) => api.post('/payments/create-qris', data, paymentAccess(orderNumber)),
  getStatus: (orderId, orderNumber) => api.get(`/payments/${orderId}/status`, paymentAccess(orderNumber)),
  simulatePay: (orderId) => api.post(`/payments/${orderId}/simulate-pay`),
  payCash: (orderId) => api.post(`/payments/${orderId}/cash`),
};

export const reportAPI = {
  getDashboard: () => api.get('/reports/dashboard'),
  getOrders: (params) => api.get('/reports/orders', { params }),
  getStocks: (params) => api.get('/reports/stocks', { params }),
  exportOrders: (params) => api.get('/reports/orders/export', { params, responseType: 'blob' }),
  exportStocks: (params) => api.get('/reports/stocks/export', { params, responseType: 'blob' }),
  getReportDashboard: (params) => api.get('/reports/report-dashboard', { params }),
  exportReportDashboard: (params) => api.get('/reports/report-dashboard/export', { params, responseType: 'blob' }),
};

export const settingAPI = {
  getAll: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

export default api;

export const optionGroupAPI = {
  getAll: () => api.get('/option-groups'),
  create: (data) => api.post('/option-groups', data),
  update: (id, data) => api.put(`/option-groups/${id}`, data),
  setAvailability: (id, choiceId, is_available) => api.patch(`/option-groups/${id}/choices/${choiceId}/availability`, { is_available }),
};

export const optionTemplateAPI = {
  getAll: () => api.get('/option-templates'),
  delete: (id) => api.delete(`/option-templates/${id}`),
};
