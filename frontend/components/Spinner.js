export default function Spinner({ size = 20, inline = false }) {
  const style = { width: size, height: size, borderWidth: Math.max(2, size / 8) };
  if (inline) {
    return <span className="spinner" style={style} role="status" aria-label="Cargando" />;
  }
  return (
    <div className="spinner-page">
      <span className="spinner" style={style} role="status" aria-label="Cargando" />
    </div>
  );
}
