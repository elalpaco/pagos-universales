import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Logo from "./Logo";
import Icon from "./icons";
import Spinner from "./Spinner";
import { useUser } from "../lib/auth";
import api from "../lib/api";

const NAV_ITEMS = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/servicios", label: "Servicios", icon: "services" },
  { href: "/tarjetas", label: "Tarjetas", icon: "cards" },
  { href: "/pagos", label: "Pagos", icon: "payments" },
  { href: "/aprobaciones", label: "Aprobaciones", icon: "approvals" },
  { href: "/notificaciones", label: "Notificaciones", icon: "notifications" },
  { href: "/perfil", label: "Perfil", icon: "profile" },
];

const TAB_ITEMS = [
  { href: "/", label: "Inicio", icon: "home" },
  { href: "/servicios", label: "Servicios", icon: "services" },
  { href: "/pagos", label: "Pagos", icon: "payments" },
  { href: "/aprobaciones", label: "Aprobar", icon: "approvals" },
  { href: "/perfil", label: "Perfil", icon: "profile" },
];

function initials(name, email) {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export default function Layout({ children, title }) {
  const router = useRouter();
  const { user, error, logout } = useUser();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (user === null && router.pathname !== "/login" && router.pathname !== "/registro") {
      router.replace("/login");
    }
  }, [user, router]);

  useEffect(() => {
    let cancelled = false;
    async function loadUnread() {
      try {
        const data = await api.get("/api/notifications");
        const list = data.notifications || data.items || data || [];
        if (!cancelled && Array.isArray(list)) {
          setUnread(list.filter((n) => !n.readAt).length);
        }
      } catch {
        // ignore
      }
    }
    if (user) {
      loadUnread();
      const id = setInterval(loadUnread, 45000);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
  }, [user, router.pathname]);

  if (user === undefined) {
    return <Spinner />;
  }

  if (!user) {
    return <Spinner />;
  }

  const navItems = user.role === "ADMIN"
    ? [...NAV_ITEMS, { href: "/admin", label: "Admin", icon: "admin" }]
    : NAV_ITEMS;

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo />
          <span>Pagos Universales</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => {
            const active = router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${active ? "active" : ""}`}
              >
                <Icon name={item.icon} className="nav-icon" />
                {item.label}
                {item.href === "/notificaciones" && unread > 0 && (
                  <span className="nav-badge">{unread > 9 ? "9+" : unread}</span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{initials(user.name, user.email)}</div>
            <div className="user-chip-meta">
              <div className="user-chip-name">{user.name || "Usuario"}</div>
              <div className="user-chip-email">{user.email}</div>
            </div>
          </div>
          <button className="logout-link" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div className="main-col">
        <div className="topbar">
          <Logo size={22} />
          <strong style={{ fontSize: 15 }}>{title || "Pagos Universales"}</strong>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
            <Link href="/notificaciones" className="nav-link" style={{ position: "relative", padding: 8 }}>
              <Icon name="notifications" size={20} />
              {unread > 0 && <span className="nav-badge" style={{ position: "absolute", top: 2, right: 2 }}>{unread > 9 ? "9+" : unread}</span>}
            </Link>
          </div>
        </div>

        <main className="page">{children}</main>
      </div>

      <nav className="tabbar">
        {TAB_ITEMS.map((item) => {
          const active = router.pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`tabbar-link ${active ? "active" : ""}`}>
              <Icon name={item.icon} className="nav-icon" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
