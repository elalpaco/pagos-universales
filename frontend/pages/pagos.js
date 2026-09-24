import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import Card from "../components/Card";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { Drawer } from "../components/Modal";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";
import { formatCOP, formatDate, formatDateTime } from "../lib/format";

const STATUS_OPTIONS = [
  "", "SCHEDULED", "PENDING_APPROVAL", "CHARGING", "CHARGED", "DISBURSING",
  "PAID", "FAILED", "SKIPPED", "REFUND_PENDING", "REFUNDED",
];

const STATUS_LABEL = {
  "": "Todos",
  SCHEDULED: "Programado",
  PENDING_APPROVAL: "Pendiente",
  CHARGING: "Cobrando",
  CHARGED: "Cobrado",
  DISBURSING: "Desembolsando",
  PAID: "Pagado",
  FAILED: "Fallido",
  SKIPPED: "Omitido",
  REFUND_PENDING: "Reembolso pend.",
  REFUNDED: "Reembolsado",
};

export default function PagosPage() {
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const [payments, setPayments] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (router.query.status) setStatus(String(router.query.status));
  }, [router.query.status]);

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      params.set("page", String(page));
      const res = await api.get(`/api/payments?${params.toString()}`);
      const list = res.payments || res.items || res || [];
      setPayments(list);
      setHasMore(Boolean(res.hasMore || (Array.isArray(list) && list.length >= 20)));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el historial.");
    }
  }, [status, page, toast]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function openDetail(p) {
    setSelected(p);
    setDetail(null);
    try {
      const res = await api.get(`/api/payments/${p.id}`);
      setDetail(res.payment || res);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el detalle.");
    }
  }

  return (
    <Layout title="Pagos">
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de pagos</h1>
          <p className="page-subtitle">Todos tus cobros, pasados y programados.</p>
        </div>
      </div>

      <div className="flex gap-8" style={{ flexWrap: "wrap", marginBottom: 18 }}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s || "all"}
            className={`chip ${status === s ? "active" : ""}`}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {!payments ? (
        <Spinner />
      ) : payments.length === 0 ? (
        <Card>
          <EmptyState icon="payments" title="No hay pagos" body="No encontramos pagos con este filtro." />
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Periodo</th>
                <th>Vencimiento</th>
                <th>Monto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} onClick={() => openDetail(p)}>
                  <td>{p.service?.customName || p.service?.biller?.name || p.serviceName || "—"}</td>
                  <td>{p.periodKey || "—"}</td>
                  <td>{formatDate(p.dueDate)}</td>
                  <td>{formatCOP(p.totalCop || p.amountCop)}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pager">
        <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
          <Icon name="chevronLeft" size={14} /> Anterior
        </button>
        <span className="text-muted">Página {page}</span>
        <button className="btn btn-secondary btn-sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
          Siguiente <Icon name="chevronRight" size={14} />
        </button>
      </div>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)}>
        {selected && (
          <div>
            <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>Detalle del pago</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <p className="text-faint" style={{ fontSize: 12.5, marginBottom: 16 }}>{selected.id}</p>

            <Card className="card-pad" style={{ background: "var(--color-surface-2)", marginBottom: 18 }}>
              <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                <strong>{selected.service?.customName || selected.service?.biller?.name || "Servicio"}</strong>
                <StatusBadge status={(detail || selected).status} />
              </div>
              <dl style={{ margin: 0, fontSize: 13.5 }}>
                <DRow label="Monto" value={formatCOP((detail || selected).amountCop)} />
                <DRow label="Comisión" value={formatCOP((detail || selected).feeCop || 0)} />
                <DRow label="Total" value={formatCOP((detail || selected).totalCop || (detail || selected).amountCop)} />
                <DRow label="Periodo" value={(detail || selected).periodKey} />
                <DRow label="Vencimiento" value={formatDate((detail || selected).dueDate)} />
                <DRow label="Programado" value={formatDate((detail || selected).scheduledFor)} />
                {(detail || selected).gatewayRef && <DRow label="Referencia pasarela" value={(detail || selected).gatewayRef} />}
                {(detail || selected).payoutRef && <DRow label="Referencia desembolso" value={(detail || selected).payoutRef} />}
                {(detail || selected).lastError && <DRow label="Último error" value={(detail || selected).lastError} />}
              </dl>
            </Card>

            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Línea de tiempo</h3>
            {!detail ? (
              <Spinner />
            ) : detail.timeline && detail.timeline.length > 0 ? (
              <div className="timeline">
                {detail.timeline.map((ev, i) => (
                  <div className="timeline-item" key={ev.id || i}>
                    <span className="timeline-dot" />
                    <div className="timeline-action">{ev.action}</div>
                    <div className="timeline-time">{formatDateTime(ev.createdAt)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-faint" style={{ fontSize: 13 }}>Sin eventos registrados.</p>
            )}
          </div>
        )}
      </Drawer>
    </Layout>
  );
}

function DRow({ label, value }) {
  return (
    <div className="flex justify-between" style={{ padding: "5px 0" }}>
      <dt className="text-faint">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value ?? "—"}</dd>
    </div>
  );
}
