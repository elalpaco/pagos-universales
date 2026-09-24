import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import Card, { CardHeader } from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";
import { formatCOP, formatDate } from "../lib/format";

export default function AdminPage() {
  const { user } = useUser();
  const toast = useToast();
  const [overview, setOverview] = useState(null);
  const [payouts, setPayouts] = useState(null);
  const [users, setUsers] = useState(null);
  const [runningScheduler, setRunningScheduler] = useState(false);
  const [completeTarget, setCompleteTarget] = useState(null);
  const [failTarget, setFailTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [appConfig, setAppConfig] = useState(null);
  const [simulatedNow, setSimulatedNow] = useState("");

  const load = useCallback(async () => {
    try {
      const [ov, po, us, cfg] = await Promise.all([
        api.get("/api/admin/overview"),
        api.get("/api/admin/payouts"),
        api.get("/api/admin/users"),
        api.get("/api/config"),
      ]);
      setOverview(ov);
      setPayouts(po.payouts || po.items || po || []);
      setUsers(us.users || us.items || us || []);
      setAppConfig(cfg);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el panel de administración.");
    }
  }, [toast]);

  useEffect(() => {
    if (user && user.role === "ADMIN") load();
  }, [user, load]);

  async function runScheduler() {
    setRunningScheduler(true);
    try {
      const body = simulatedNow ? { now: new Date(simulatedNow).toISOString() } : undefined;
      await api.post("/api/admin/scheduler/run", body);
      toast.success("Programador ejecutado.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo ejecutar el programador.");
    } finally {
      setRunningScheduler(false);
    }
  }

  const isProduction = appConfig?.env === "production";

  if (user && user.role !== "ADMIN") {
    return (
      <Layout title="Admin">
        <Card>
          <EmptyState icon="admin" title="Acceso restringido" body="Solo los administradores pueden ver esta sección." />
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Admin">
      <div className="page-header">
        <div>
          <h1 className="page-title">Administración</h1>
          <p className="page-subtitle">Métricas, desembolsos y operación del sistema.</p>
        </div>
        <div className="flex items-center gap-8" style={{ flexWrap: "wrap" }}>
          {!isProduction && (
            <Input
              id="simulatedNow"
              label="Simular fecha"
              type="datetime-local"
              value={simulatedNow}
              onChange={(e) => setSimulatedNow(e.target.value)}
              hint="Opcional: solo disponible fuera de producción."
              wrapperClassName="field-inline"
            />
          )}
          <Button variant="secondary" loading={runningScheduler} onClick={runScheduler}>
            <Icon name="bolt" size={15} /> Correr programador ahora
          </Button>
        </div>
      </div>

      {!overview ? (
        <Spinner />
      ) : (
        <div className="grid grid-4" style={{ marginBottom: 24 }}>
          <Card className="stat-card">
            <div className="stat-label">Usuarios</div>
            <div className="stat-value">{overview.users ?? overview.totalUsers ?? "—"}</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label">Servicios activos</div>
            <div className="stat-value">{overview.services ?? overview.activeServices ?? "—"}</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label">Cobrado este mes</div>
            <div className="stat-value">{formatCOP(overview.chargedThisMonthCop ?? overview.monthChargedCop ?? 0)}</div>
          </Card>
          <Card className="stat-card">
            <div className="stat-label">Comisiones</div>
            <div className="stat-value">{formatCOP(overview.feesCop ?? overview.totalFeesCop ?? 0)}</div>
            <div className="stat-meta text-danger">{overview.failedCount ?? overview.failed ?? 0} fallidos</div>
          </Card>
        </div>
      )}

      <Card padded={false} style={{ marginBottom: 24 }}>
        <div style={{ padding: "20px 20px 0" }}>
          <CardHeader title="Cola de desembolsos" />
        </div>
        {!payouts ? (
          <Spinner />
        ) : payouts.length === 0 ? (
          <EmptyState icon="payments" title="Sin desembolsos pendientes" body="No hay pagos esperando ser desembolsados." />
        ) : (
          <div>
            {payouts.map((p) => (
              <div className="list-row" key={p.id}>
                <div className="list-row-main">
                  <div className="list-row-title">{p.service?.customName || p.service?.biller?.name || p.user?.email || "Pago"}</div>
                  <div className="list-row-sub">
                    {formatCOP(p.totalCop || p.amountCop)} · {formatDate(p.dueDate)} · {p.user?.email}
                  </div>
                </div>
                <div className="flex gap-8">
                  <Button size="sm" variant="secondary" onClick={() => setFailTarget(p)}>
                    Marcar fallido
                  </Button>
                  <Button size="sm" onClick={() => setCompleteTarget(p)}>
                    Marcar pagado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card padded={false}>
        <div style={{ padding: "20px 20px 0" }}>
          <CardHeader title="Usuarios" />
        </div>
        {!users ? (
          <Spinner />
        ) : (
          <div className="table-wrap" style={{ border: "none" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Registrado</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ cursor: "default" }}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>{u.role}</td>
                    <td>{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CompletePayoutModal
        payment={completeTarget}
        onClose={() => setCompleteTarget(null)}
        onDone={() => {
          setCompleteTarget(null);
          load();
        }}
      />
      <FailPayoutModal
        payment={failTarget}
        onClose={() => setFailTarget(null)}
        onDone={() => {
          setFailTarget(null);
          load();
        }}
      />
    </Layout>
  );
}

function CompletePayoutModal({ payment, onClose, onDone }) {
  const toast = useToast();
  const [payoutRef, setPayoutRef] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPayoutRef("");
    setReceiptUrl("");
  }, [payment]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/api/admin/payouts/${payment.id}/complete`, {
        payoutRef,
        receiptUrl: receiptUrl || undefined,
      });
      toast.success("Desembolso marcado como pagado.");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo completar el desembolso.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={Boolean(payment)} onClose={onClose} title="Marcar como pagado">
      <form onSubmit={submit}>
        <Input
          id="payoutRef"
          label="Referencia del pago"
          required
          value={payoutRef}
          onChange={(e) => setPayoutRef(e.target.value)}
        />
        <Input
          id="receiptUrl"
          label="URL del comprobante (opcional)"
          value={receiptUrl}
          onChange={(e) => setReceiptUrl(e.target.value)}
        />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={loading}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}

function FailPayoutModal({ payment, onClose, onDone }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setReason("");
  }, [payment]);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/api/admin/payouts/${payment.id}/fail`, { reason });
      toast.success("Desembolso marcado como fallido.");
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo marcar como fallido.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={Boolean(payment)} onClose={onClose} title="Marcar como fallido">
      <form onSubmit={submit}>
        <Input
          id="reason"
          label="Motivo"
          required
          as="textarea"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" loading={loading}>Confirmar</Button>
        </div>
      </form>
    </Modal>
  );
}
