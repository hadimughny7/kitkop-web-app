import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  HiOutlineHome,
  HiOutlineClipboardList,
  HiOutlineShoppingCart,
  HiOutlineCube,
  HiOutlineChartBar,
  HiOutlineUsers,
  HiOutlineViewGrid,
  HiOutlineLogout,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineTable,
  HiOutlineTag,
  HiOutlineBeaker,
} from 'react-icons/hi';
import { useState } from 'react';
import './DashboardLayout.css';

const DashboardLayout = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const menuItems = [
    {
      label: 'Dashboard',
      icon: <HiOutlineHome />,
      path: '/dashboard',
      roles: ['owner', 'manajer', 'kasir', 'kitchen', 'barista'],
    },
    {
      label: 'Pesanan',
      icon: <HiOutlineClipboardList />,
      path: '/dashboard/orders',
      roles: ['owner', 'manajer', 'kasir'],
    },
    {
      label: 'Dapur & Barista',
      icon: <HiOutlineViewGrid />,
      path: '/dashboard/kitchen',
      roles: ['owner', 'manajer', 'kitchen'],
    },

    {
      label: 'Kasir (POS)',
      icon: <HiOutlineShoppingCart />,
      path: '/dashboard/kasir',
      roles: ['owner', 'manajer', 'kasir'],
    },
    {
      label: 'Menu',
      icon: <HiOutlineTag />,
      path: '/dashboard/menus',
      roles: ['owner', 'manajer', 'kasir'],
    },
    {
      label: 'Meja',
      icon: <HiOutlineTable />,
      path: '/dashboard/tables',
      roles: ['owner', 'manajer', 'kasir'],
    },
    {
      label: 'Stok Bahan',
      icon: <HiOutlineCube />,
      path: '/dashboard/stocks',
      roles: ['owner', 'manajer', 'kitchen'],
    },
    {
      label: 'Riwayat Stok',
      icon: <HiOutlineBeaker />,
      path: '/dashboard/stock-history',
      roles: ['owner', 'manajer'],
    },
    {
      label: 'Laporan',
      icon: <HiOutlineChartBar />,
      path: '/dashboard/reports',
      roles: ['owner', 'manajer'],
    },
    {
      label: 'Pengguna',
      icon: <HiOutlineUsers />,
      path: '/dashboard/users',
      roles: ['owner', 'manajer'],
    },
  ];

  const filteredMenu = menuItems.filter((item) =>
    item.roles.includes(user?.role)
  );

  const roleLabels = {
    owner: 'Owner',
    manajer: 'Manajer',
    kasir: 'Kasir',
    kitchen: 'Dapur',
  };

  return (
    <div className="dashboard-layout">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/logo-kitkop.png" alt="Kitkop.id" className="logo-img" />
            <div>
              <h1 className="logo-text">Kitkop.id</h1>
              <p className="logo-subtitle">Kedai Kopi</p>
            </div>
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
            <HiOutlineX />
          </button>
        </div>

        <nav className="sidebar-nav">
          {filteredMenu.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
              onClick={() => setSidebarOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="user-details">
              <p className="user-name">{user?.name}</p>
              <p className="user-role">{roleLabels[user?.role]}</p>
            </div>
          </div>
          <button className="btn-logout" onClick={handleLogout} title="Logout">
            <HiOutlineLogout />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>
            <HiOutlineMenu />
          </button>
          <div className="header-info">
            <h2 className="header-greeting">
              Halo, {user?.name?.split(' ')[0]}! 👋
            </h2>
            <p className="header-date">
              {new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        </header>
        <div className="dashboard-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
