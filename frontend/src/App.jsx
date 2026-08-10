import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';

// Components
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';

// Auth
import LoginPage from './pages/auth/LoginPage';

// Customer Pages
import WelcomePage from './pages/customer/WelcomePage';
import MenuPage from './pages/customer/MenuPage';
import CartPage from './pages/customer/CartPage';
import OrderStatusPage from './pages/customer/OrderStatusPage';

// Staff Pages
import MainDashboard from './pages/dashboard/MainDashboard';
import KitchenDashboard from './pages/kitchen/KitchenDashboard';
import POSDashboard from './pages/kasir/POSDashboard';
import OrderDashboard from './pages/orders/OrderDashboard';
import MenuManagement from './pages/menus/MenuManagement';
import StockManagement from './pages/stocks/StockManagement';
import StockHistory from './pages/stocks/StockHistory';
import UserManagement from './pages/users/UserManagement';
import ReportDashboard from './pages/reports/ReportDashboard';
import TableManagement from './pages/tables/TableManagement';

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
            <Route path="/login" element={<LoginPage />} />

            {/* Customer Routes */}
            <Route path="/order/welcome" element={<WelcomePage />} />
            <Route path="/order/menu" element={<MenuPage />} />
            <Route path="/order/cart" element={<CartPage />} />
            <Route path="/order/status/:orderNumber" element={<OrderStatusPage />} />

            {/* Staff Routes (Protected) */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              {/* General Dashboard (Owner, Manager) */}
              <Route index element={<ProtectedRoute roles={['owner', 'manajer']}><MainDashboard /></ProtectedRoute>} />
              
              {/* Specific Stations */}
              <Route path="kitchen" element={<ProtectedRoute roles={['owner', 'manajer', 'kitchen']}><KitchenDashboard /></ProtectedRoute>} />
              <Route path="kasir" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><POSDashboard /></ProtectedRoute>} />
              
              {/* Management */}
              <Route path="menus" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><MenuManagement /></ProtectedRoute>} />
              <Route path="stocks" element={<ProtectedRoute roles={['owner', 'manajer', 'kitchen', 'barista']}><StockManagement /></ProtectedRoute>} />
              <Route path="stock-history" element={<ProtectedRoute roles={['owner', 'manajer']}><StockHistory /></ProtectedRoute>} />
              <Route path="users" element={<ProtectedRoute roles={['owner', 'manajer']}><UserManagement /></ProtectedRoute>} />
              <Route path="reports" element={<ProtectedRoute roles={['owner', 'manajer']}><ReportDashboard /></ProtectedRoute>} />
              
              {/* Order Dashboard */}
              <Route path="orders" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><OrderDashboard /></ProtectedRoute>} />
              <Route path="tables" element={<ProtectedRoute roles={['owner', 'manajer', 'kasir']}><TableManagement /></ProtectedRoute>} />
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
