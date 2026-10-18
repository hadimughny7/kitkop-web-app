import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { initAudioContext } from '../../utils/notificationSound';
import toast from 'react-hot-toast';
import { HiOutlineMail, HiOutlineLockClosed, HiOutlineEye, HiOutlineEyeOff, HiOutlineArrowRight } from 'react-icons/hi';
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

    // Unlock notification audio during the login gesture, before the async request.
    initAudioContext();
    setLoading(true);
    try {
      const user = await doLogin({ login, password });
      toast.success(`Selamat datang, ${user.name}!`);

      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-story" aria-label="Kitkop Kedai Kopi">
        <a className="login-brand" href="/login">
          <img src="/logo-kitkop.png" alt="" width="44" height="44" />
          <span>kitkop.id</span>
        </a>
        <div className="login-story-copy">
          <h2>Good coffee.{' '}<br />Good company.{' '}<br /><span>Every day.</span></h2>
        </div>
        <div className="login-brand-art" aria-hidden="true">
          <div className="brand-sticker"><img src="/logo-kitkop.png" alt="" width="128" height="128" /><span>PLACE FOR<br />EVERYONE.</span><HiOutlineArrowRight /></div>
          <span className="brand-art-note">Kopi yang baik, untuk siapa saja.</span>
        </div>
        <p className="login-story-footer">Kitkop.id <span>Sistem Buat Pahlawan kitkop.id</span></p>
      </aside>

      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <p className="login-eyebrow"><span className="eyebrow-line" /> KITKOP WORKSPACE</p>
            <h1>Siap untuk{' '}<br />hari yang baik?</h1>
            <p>Masuk dan mulai aktivitas kedai hari ini.</p>
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
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPassword}
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
                <>Masuk ke workspace <HiOutlineArrowRight aria-hidden="true" /></>
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
