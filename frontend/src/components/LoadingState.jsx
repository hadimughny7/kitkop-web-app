export default function LoadingState({ children = 'Memuat data...' }) {
  return (
    <div className="loading-screen" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{children}</p>
    </div>
  );
}
