export default function Input({
  label,
  id,
  error,
  hint,
  prefix,
  className = "",
  wrapperClassName = "",
  as = "input",
  children,
  ...rest
}) {
  const Tag = as;
  const inputEl = (
    <Tag
      id={id}
      className={`input ${error ? "has-error" : ""} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );

  return (
    <div className={`field ${wrapperClassName}`}>
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      {prefix ? (
        <div className="input-prefix-wrap">
          <span className="input-prefix">{prefix}</span>
          {inputEl}
        </div>
      ) : (
        inputEl
      )}
      {error ? (
        <div className="field-error">{error}</div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}
