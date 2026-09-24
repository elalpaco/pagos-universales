import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import Card, { CardHeader } from "../components/Card";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";
import { formatCOP, formatDate } from "../lib/format";

export default function DashboardPage() {
  const { user } = useUser();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/dashboard");
      setData(res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el panel.");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function approve(id) {
    setBusyId(id);
    try {
      await api.post(`/api/payments/${id}/approve`);
      toast.success("Pago aprobado.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo aprobar el pago.");
    } finally {
      setBusyId(null);
    }
  }

  async function skip(id) {
    setBusyId(id);
    try {
      await api.post(`/api/payments/${id}/skip`);
      toast.success("Pago omitido.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo omitir el pago.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout title="Inicio">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hola, {user?.name?.split(" ")[0] || "de nuevo"}</h1>
          <p className="page-subtitle">Así va tu cuenta de pagos automáticos.</p>
        </div>
      </div>

      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: 24 }}>
            <Card className="stat-card">
              <div className="stat-label">Próximo cobro</div>
              <div className="stat-value">
                {data.nextCharge ? formatDate(data.nextCharge.scheduledFor || data.nextCharge.dueDate) : "—"}
              </div>
              <div className="stat-meta">
                {data.nextCharge ? data.nextCharge.serviceName || data.nextCharge.service?.customName : "Sin cobros programados"}
              </div>
            </Card>
            <Card className="stat-card">
              <div className="stat-label">Total del mes</div>
              <div className="stat-value">{formatCOP(data.monthTotalCop || 0)}</div>
              <div className="stat-meta">Pagado: {formatCOP(data.monthPaidCop || 0)}</div>
            </Card>
            <Card className="stat-card">
              <div className="stat-label">Servicios activos</div>
              <div className="stat-value">{data.activeServices ?? 0}</div>
              <div className="stat-meta">
                <Link href="/servicios">Ver todos</Link>
              </div>
            </Card>
            <Card className="stat-card">
              <div className="stat-label">Pagos fallidos</div>
              <div className="stat-value" style={{ color: data.failedCount ? "var(--color-danger)" : undefined }}>
                {data.failedCount ?? 0}
              </div>
              <div className="stat-meta">
                <Link href="/pagos?status=FAILED">Revisar</Link>
              </div>
            </Card>
          </div>

          {data.pendingApproval && data.pendingApproval.length > 0 && (
            <Card padded={false} style={{ marginBottom: 24 }}>
              <div style={{ padding: "20px 20px 0" }}>
                <CardHeader
                  title={`Pendientes de aprobación (${data.pendingApproval.length})`}
                  action={<Link href="/aprobaciones" className="btn btn-ghost btn-sm">Ver todas</Link>}
                />
              </div>
              <div>
                {data.pendingApproval.slice(0, 5).map((p) => (
                  <div className="list-row" key={p.id}>
                    <div className="list-row-icon">
                      <Icon name="alert" size={18} />
                    </div>
                    <div className="list-row-main">
                      <div className="list-row-title">{p.service?.customName || p.service?.biller?.name || p.serviceName || "Servicio"}</div>
                      <div className="list-row-sub">
                        {formatCOP(p.amountCop)} · vence {formatDate(p.dueDate)}
                      </div>
                    </div>
                    <div className="flex gap-8">
                      <Button size="sm" variant="secondary" loading={busyId === p.id} onClick={() => skip(p.id)}>
                        Omitir
                      </Button>
                      <Button size="sm" loading={busyId === p.id} onClick={() => approve(p.id)}>
                        Aprobar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-2">
            <Card padded={false}>
              <div style={{ padding: "20px 20px 0" }}>
                <CardHeader title="Próximos pagos" />
              </div>
              {data.upcoming && data.upcoming.length > 0 ? (
                <div>
                  {data.upcoming.slice(0, 10).map((p) => (
                    <div className="list-row" key={p.id}>
                      <div className="list-row-icon">
                        <Icon name="payments" size={18} />
                      </div>
                      <div className="list-row-main">
                        <div className="list-row-title">{p.service?.customName || p.service?.biller?.name || p.serviceName || "Servicio"}</div>
                        <div className="list-row-sub">{formatDate(p.scheduledFor || p.dueDate)}</div>
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="payments" title="Sin pagos próximos" body="Cuando programes servicios verás aquí los próximos cobros." />
              )}
            </Card>

            <Card padded={false}>
              <div style={{ padding: "20px 20px 0" }}>
                <CardHeader title="Resumen" />
              </div>
              <div className="card-pad" style={{ paddingTop: 4 }}>
                <p className="text-muted" style={{ marginBottom: 10 }}>
                  Cuentas con <strong>{data.activeServices ?? 0}</strong> servicios activos pagándose automáticamente.
                </p>
                {data.failedCount > 0 ? (
                  <p className="text-danger">
                    Tienes {data.failedCount} pago(s) fallido(s) que requieren tu atención.
                  </p>
                ) : (
                  <p className="text-success">No tienes pagos fallidos. Todo en orden.</p>
                )}
                <div style={{ marginTop: 16 }}>
                  <Link href="/servicios" className="btn btn-secondary btn-sm">
                    Agregar un servicio
                  </Link>
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
}
