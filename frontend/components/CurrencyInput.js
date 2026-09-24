import { formatCOPInput, parseCOPInput } from "../lib/format";

// Controlled input: `value` is an integer (or null), onChange receives an integer (or null).
export default function CurrencyInput({ value, onChange, id, label, error, hint, placeholder }) {
  return (
    <div className="field">
      {label && (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="input-prefix-wrap">
        <span className="input-prefix">$</span>
        <input
          id={id}
          className={`input ${error ? "has-error" : ""}`}
          inputMode="numeric"
          placeholder={placeholder || "0"}
          value={value === null || value === undefined ? "" : formatCOPInput(value)}
          onChange={(e) => onChange(parseCOPInput(e.target.value))}
        />
      </div>
      {error ? (
        <div className="field-error">{error}</div>
      ) : hint ? (
        <div className="field-hint">{hint}</div>
      ) : null}
    </div>
  );
}
