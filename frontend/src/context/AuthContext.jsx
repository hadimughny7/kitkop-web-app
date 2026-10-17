import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';
import { disconnectStaffSockets } from '../services/socket';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('kitkop_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const endSession = event => {
      // A delayed event from an old socket must not sign out a new login.
      if (!event.detail?.token || event.detail.token !== localStorage.getItem('kitkop_token')) return;
      disconnectStaffSockets();
      localStorage.removeItem('kitkop_token');
      localStorage.removeItem('kitkop_user');
      setToken(null);
      setUser(null);
    };
    const syncLogout = event => {
      if (event.key === 'kitkop_token' && !event.newValue && !localStorage.getItem('kitkop_token')) {
        disconnectStaffSockets(); setToken(null); setUser(null);
      }
    };
    window.addEventListener('kitkop:session-revoked', endSession);
    window.addEventListener('storage', syncLogout);
    return () => {
      window.removeEventListener('kitkop:session-revoked', endSession);
      window.removeEventListener('storage', syncLogout);
    };
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await authAPI.getMe();
          if (localStorage.getItem('kitkop_token') === token) setUser(res.data.data);
        } catch {
          if (localStorage.getItem('kitkop_token') === token) logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (credentials) => {
    const res = await authAPI.login(credentials);
    const { token: newToken, user: userData } = res.data.data;
    localStorage.setItem('kitkop_token', newToken);
    localStorage.setItem('kitkop_user', JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
    return userData;
  };

  const logout = () => {
    disconnectStaffSockets();
    localStorage.removeItem('kitkop_token');
    localStorage.removeItem('kitkop_user');
    setToken(null);
    setUser(null);
  };

  const hasRole = (...roles) => {
    return user && roles.includes(user.role);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
};
