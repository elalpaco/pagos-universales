export default function Logo({ size = 26 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="9" fill="var(--color-primary)" />
      <path
        d="M10 22V10.5a1 1 0 0 1 1-1h4.4a4.3 4.3 0 0 1 0 8.6H12"
        stroke="var(--color-on-primary)"
        strokeWidth="2.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="21.5" cy="21.5" r="2" fill="var(--color-on-primary)" />
    </svg>
  );
}
