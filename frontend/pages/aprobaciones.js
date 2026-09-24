import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import Card from "../components/Card";
import Button from "../components/Button";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import CurrencyInput from "../components/CurrencyInput";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";
import { formatCOP, formatDate } from "../lib/format";

export default function AprobacionesPage() {
  const { user } = useUser();
  const toast = useToast();
  const [payments, setPayments] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/payments?status=PENDING_APPROVAL");
      setPayments(res.payments || res.items || res || []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar las aprobaciones.");
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
      toast.error(err instanceof ApiError ? err.message : "No se pudo aprobar.");
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
      toast.error(err instanceof ApiError ? err.message : "No se pudo omitir.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveAmount(id) {
    setBusyId(id);
    try {
      await api.patch(`/api/payments/${id}/amount`, { amountCop: editAmount });
      toast.success("Monto actualizado.");
      setEditingId(null);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar el monto.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Layout title="Aprobaciones">
      <div className="page-header">
        <div>
          <h1 className="page-title">Aprobaciones</h1>
          <p className="page-subtitle">Pagos que superan el tope y necesitan tu visto bueno.</p>
        </div>
      </div>

      {!payments ? (
        <Spinner />
      ) : payments.length === 0 ? (
        <Card>
          <EmptyState icon="approvals" title="Todo al día" body="No tienes pagos pendientes de aprobación." />
        </Card>
      ) : (
        <div className="grid" style={{ gap: 14 }}>
          {payments.map((p) => (
            <Card key={p.id}>
              <div className="flex justify-between items-center" style={{ marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {p.service?.customName || p.service?.biller?.name || "Servicio"}
                  </div>
                  <div className="text-faint" style={{ fontSize: 12.5 }}>
                    Periodo {p.periodKey} · vence {formatDate(p.dueDate)}
                  </div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{formatCOP(p.amountCop)}</div>
              </div>

              {editingId === p.id ? (
                <div className="flex items-center gap-8" style={{ marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <CurrencyInput id={`amount-${p.id}`} value={editAmount} onChange={setEditAmount} />
                  </div>
                  <Button size="sm" loading={busyId === p.id} onClick={() => saveAmount(p.id)}>Guardar</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditingId(null)}>Cancelar</Button>
                </div>
              ) : null}

              <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                <Button loading={busyId === p.id} onClick={() => approve(p.id)}>
                  <Icon name="check" size={15} /> Aprobar
                </Button>
                <Button variant="secondary" loading={busyId === p.id} onClick={() => skip(p.id)}>
                  Omitir
                </Button>
                {editingId !== p.id && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditingId(p.id);
                      setEditAmount(p.amountCop);
                    }}
                  >
                    <Icon name="edit" size={14} /> Ajustar monto
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}
