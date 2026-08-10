import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff } from 'react-icons/hi';
import './LoginPage.css';

const LoginPage = () => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login: doLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!login || !password) {
      toast.error('Email/username dan password wajib diisi.');
      return;
    }

    setLoading(true);
    try {
      const user = await doLogin({ login, password });
      toast.success(`Selamat datang, ${user.name}!`);

      // Redirect based on role
      switch (user.role) {
        case 'kitchen':
          navigate('/dashboard/kitchen');
          break;
        case 'kasir':
          navigate('/dashboard/kasir');
          break;
        default:
          navigate('/dashboard');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-bg-pattern"></div>
      </div>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <img src="/logo-kitkop.png" alt="Kitkop.id" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 12px' }} />
            <h1>Kitkop.id</h1>
          </div>

          <form className="login-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="login-email">
                Email atau Username
              </label>
              <div className="input-with-icon">
                <HiOutlineMail className="input-icon" />
                <input
                  id="login-email"
                  type="text"
                  className="form-input"
                  placeholder="Masukkan email atau username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="login-password">
                Password
              </label>
              <div className="input-with-icon">
                <HiOutlineLockClosed className="input-icon" />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Masukkan password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <HiOutlineEyeOff /> : <HiOutlineEye />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg login-btn"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }}></div>
                  Memproses...
                </>
              ) : (
                'Masuk'
              )}
            </button>
          </form>

          <div className="login-footer">
            <p>Khusus untuk staff Kitkop.id</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
