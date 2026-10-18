import { NavLink, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
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
  HiOutlineCog,
} from 'react-icons/hi';
import { useState } from 'react';
import StaffOrderNotifications from './StaffOrderNotifications';
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
      roles: ['owner', 'manajer', 'kitchen', 'barista'],
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
      roles: ['owner', 'manajer', 'kitchen', 'barista'],
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
    {
      label: 'Pengaturan',
      icon: <HiOutlineCog />,
      path: '/dashboard/settings',
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
    barista: 'Barista',
  };

  return (
    <div className="dashboard-layout">
      <a className="skip-link" href="#dashboard-content">Lewati ke konten</a>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside id="dashboard-sidebar" className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/logo-kitkop.png" alt="Kitkop.id" className="logo-img" />
            <div>
              <h1 className="logo-text">kitkop.id</h1>
              <p className="logo-subtitle">PLACE FOR EVERYONE</p>
            </div>
          </div>
          <button className="sidebar-close" aria-label="Tutup navigasi" onClick={() => setSidebarOpen(false)}>
            <HiOutlineX />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Navigasi utama">
          <p className="nav-caption">OPERASIONAL KEDAI</p>
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
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
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
          <button className="btn-logout" onClick={handleLogout} title="Keluar" aria-label="Keluar dari akun">
            <HiOutlineLogout />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <button className="menu-toggle" aria-label="Buka navigasi" aria-controls="dashboard-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
            <HiOutlineMenu />
          </button>
          <p className="workspace-label"><span>KITKOP</span><span className="workspace-divider">/</span><span>WORKSPACE</span></p>
          <div className="header-info">
            <h2 className="header-greeting">
              Halo, {user?.name?.split(' ')[0]}
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
        <StaffOrderNotifications key={user?.id} />
        <div id="dashboard-content" className="dashboard-content" tabIndex={-1}>
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
