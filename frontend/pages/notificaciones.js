import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import Card from "../components/Card";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";
import { formatRelative } from "../lib/format";

export default function NotificacionesPage() {
  const { user } = useUser();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/notifications");
      setItems(res.notifications || res.items || res || []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar las notificaciones.");
    }
  }, [toast]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await api.post("/api/notifications/read-all");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    } finally {
      setMarkingAll(false);
    }
  }

  const unreadCount = (items || []).filter((n) => !n.readAt).length;

  return (
    <Layout title="Notificaciones">
      <div className="page-header">
        <div>
          <h1 className="page-title">Notificaciones</h1>
          <p className="page-subtitle">Avisos sobre tus cobros y aprobaciones.</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="secondary" loading={markingAll} onClick={markAllRead}>
            Marcar todas como leídas
          </Button>
        )}
      </div>

      {!items ? (
        <Spinner />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState icon="notifications" title="Sin notificaciones" body="Aquí verás avisos sobre tus cobros, aprobaciones y tarjetas." />
        </Card>
      ) : (
        <Card padded={false}>
          {items.map((n) => (
            <div
              key={n.id}
              className="list-row"
              style={{ background: n.readAt ? "transparent" : "var(--color-primary-soft)" }}
            >
              <div className="list-row-icon">
                <Icon name="notifications" size={17} />
              </div>
              <div className="list-row-main">
                <div className="list-row-title">{n.title}</div>
                <div className="list-row-sub">{n.body}</div>
              </div>
              <div className="text-faint" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {formatRelative(n.createdAt)}
              </div>
            </div>
          ))}
        </Card>
      )}
    </Layout>
  );
}
