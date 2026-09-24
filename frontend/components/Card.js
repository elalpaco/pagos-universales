export default function Card({ children, className = "", padded = true, ...rest }) {
  return (
    <div className={`card ${padded ? "card-pad" : ""} ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }) {
  return (
    <div className="card-header">
      <h3 className="card-title">{title}</h3>
      {action}
    </div>
  );
}
