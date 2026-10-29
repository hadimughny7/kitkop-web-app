export default function LoadError({ title, onRetry }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
      <div className="card-body">
        <p role="alert">{title}</p>
        <p style={{ marginBlock: 'var(--space-3)', color: 'var(--neutral-600)' }}>
          Periksa koneksi lalu coba lagi. Data yang gagal dimuat belum dapat ditampilkan.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onRetry}>Coba lagi</button>
      </div>
    </div>
  );
}
