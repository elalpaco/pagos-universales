// Minimal inline icon set (stroke-based, feather-style), no external deps.

const paths = {
  home: "M3 11.5 12 4l9 7.5 M5.5 10v9.5a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V10",
  services: "M4 6h16 M4 6v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6 M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2 M9 11h6 M9 15h6",
  cards: "M3 7a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7Z M3 10h18 M7 15h4",
  payments: "M12 3v18 M17 7.5c0-1.4-1.8-2.5-5-2.5s-5 1.5-5 3.2c0 3.7 10 1.7 10 5.7 0 2-2.2 3.1-5 3.1s-5-1.1-5-2.6",
  approvals: "M9 12.5 11 14.5 15.5 10 M12 3l8 4v5c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V7l8-4Z",
  notifications: "M6 8a6 6 0 1 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z M10 19a2 2 0 0 0 4 0",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7",
  admin: "M12 2 4 5.5v6c0 5 3.4 8.9 8 10.5 4.6-1.6 8-5.5 8-10.5v-6L12 2Z M9.5 12.5l1.8 1.8 3.5-4.2",
  close: "M6 6l12 12M18 6L6 18",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7",
  plus: "M12 5v14M5 12h14",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3",
  pause: "M8 5h3v14H8zM13 5h3v14h-3z",
  play: "M7 4.5v15l13-7.5Z",
  trash: "M4 7h16 M9 7V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V7 M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13",
  edit: "M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z M14 6l4 4",
  bolt: "M13 2 4 14h6l-1 8 9-12h-6l1-8Z",
  logout: "M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4 M16 17l5-5-5-5 M21 12H9",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  alert: "M12 9v4 M12 17h.01 M10.3 3.9 2.5 18a1.5 1.5 0 0 0 1.3 2.2h16.4a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z",
  inbox: "M4 12h4l2 3h4l2-3h4 M4 12l1.5-7A1 1 0 0 1 6.5 4h11a1 1 0 0 1 1 1.5L20 12v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z",
};

export default function Icon({ name, className = "nav-icon", size }) {
  const d = paths[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={size}
      height={size}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
