import Spinner from "./Spinner";

export default function Button({
  children,
  variant = "primary",
  size,
  loading = false,
  disabled,
  block,
  className = "",
  type = "button",
  ...rest
}) {
  const classes = [
    "btn",
    `btn-${variant}`,
    size === "sm" ? "btn-sm" : "",
    block ? "btn-block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {loading && <Spinner size={14} inline />}
      {children}
    </button>
  );
}
