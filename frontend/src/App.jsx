import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';

// Auth
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));

// Customer Pages
const WelcomePage = lazy(() => import('./pages/customer/WelcomePage'));
const MenuPage = lazy(() => import('./pages/customer/MenuPage'));
const CartPage = lazy(() => import('./pages/customer/CartPage'));
const OrderStatusPage = lazy(() => import('./pages/customer/OrderStatusPage'));

// Staff Pages
const DashboardHome = lazy(() => import('./pages/dashboard/DashboardHome'));
const KitchenDashboard = lazy(() => import('./pages/kitchen/KitchenDashboard'));
const POSDashboard = lazy(() => import('./pages/kasir/POSDashboard'));
const OrderDashboard = lazy(() => import('./pages/orders/OrderDashboard'));
const MenuManagement = lazy(() => import('./pages/menus/MenuManagement'));
const StockManagement = lazy(() => import('./pages/stocks/StockManagement'));
const StockHistory = lazy(() => import('./pages/stocks/StockHistory'));
const UserManagement = lazy(() => import('./pages/users/UserManagement'));
const ReportDashboard = lazy(() => import('./pages/reports/ReportDashboard'));
const TableManagement = lazy(() => import('./pages/tables/TableManagement'));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage'));

function Page({ children }) {
  return <Suspense fallback={<div className="loading-screen" role="status"><div className="spinner" />Memuat halaman...</div>}>{children}</Suspense>;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Toaster position="top-center" toastOptions={{ duration: 3000, className: 'toast-custom' }} />
          
          <Routes>
            {/* Redirect root to login */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            
            {/* Auth */}
            <Route path="/login" element={<Page><LoginPage /></Page>} />

            {/* Customer Routes */}
            <Route path="/order/welcome" element={<Page><WelcomePage /></Page>} />
            <Route path="/order/menu" element={<Page><MenuPage /></Page>} />
            <Route path="/order/cart" element={<Page><CartPage /></Page>} />
            <Route path="/order/status/:orderNumber" element={<Page><OrderStatusPage /></Page>} />

            {/* Staff Routes (Protected) */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              {/* Dashboard content follows the authenticated staff role. */}
              <Route index element={<Page><DashboardHome /></Page>} />
              
              {/* Specific Stations */}
              <Route path="kitchen" element={<ProtectedRoute roles={['owner', 'manajer', 'kitchen', 'barista']}><Page><KitchenDashboard /></Page></ProtectedRoute>} />
              <Route path="kasir" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><Page><POSDashboard /></Page></ProtectedRoute>} />
              
              {/* Management */}
              <Route path="menus" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><Page><MenuManagement /></Page></ProtectedRoute>} />
              <Route path="stocks" element={<ProtectedRoute roles={['owner', 'manajer', 'kitchen', 'barista']}><Page><StockManagement /></Page></ProtectedRoute>} />
              <Route path="stock-history" element={<ProtectedRoute roles={['owner', 'manajer']}><Page><StockHistory /></Page></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute roles={['owner', 'manajer']}><Page><UserManagement /></Page></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute roles={['owner', 'manajer']}><Page><ReportDashboard /></Page></ProtectedRoute>} />
              
              {/* Order Dashboard */}
              <Route path="orders" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><Page><OrderDashboard /></Page></ProtectedRoute>} />
              <Route path="tables" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><Page><TableManagement /></Page></ProtectedRoute>} />
              <Route path="settings" element={<ProtectedRoute roles={['owner', 'manajer']}><Page><SettingsPage /></Page></ProtectedRoute>} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
