import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Layout from "../../components/Layout";
import Card, { CardHeader } from "../../components/Card";
import Button from "../../components/Button";
import Input from "../../components/Input";
import CurrencyInput from "../../components/CurrencyInput";
import Spinner from "../../components/Spinner";
import StatusBadge from "../../components/StatusBadge";
import EmptyState from "../../components/EmptyState";
import Icon from "../../components/icons";
import { useToast } from "../../components/Toast";
import { useUser } from "../../lib/auth";
import api, { ApiError } from "../../lib/api";
import { formatCOP, formatDate } from "../../lib/format";

const FREQ_LABEL = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  BIMONTHLY: "Bimestral",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
};

export default function ServiceDetailPage() {
  const { user } = useUser();
  const router = useRouter();
  const { id } = router.query;
  const toast = useToast();
  const [service, setService] = useState(null);
  const [payments, setPayments] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/api/services/${id}`);
      const svc = res.service || res;
      setService(svc);
      setForm({
        customName: svc.customName || "",
        reference: svc.reference || "",
        fixedAmountCop: svc.fixedAmountCop || null,
        maxAmountCop: svc.maxAmountCop || null,
        dueDay: svc.dueDay || "",
        payDaysBefore: svc.payDaysBefore ?? 2,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el servicio.");
    }
  }, [id, toast]);

  const loadPayments = useCallback(async () => {
    if (!id) return;
    try {
      const res = await api.get(`/api/payments?serviceId=${id}`);
      setPayments(res.payments || res.items || res || []);
    } catch {
      setPayments([]);
    }
  }, [id]);

  useEffect(() => {
    if (user && id) {
      load();
      loadPayments();
    }
  }, [user, id, load, loadPayments]);

  async function saveEdit() {
    setSaving(true);
    try {
      await api.patch(`/api/services/${id}`, {
        customName: form.customName || undefined,
        reference: form.reference,
        fixedAmountCop: service.amountType === "FIXED" ? form.fixedAmountCop : undefined,
        maxAmountCop: form.maxAmountCop || undefined,
        dueDay: Number(form.dueDay),
        payDaysBefore: Number(form.payDaysBefore),
      });
      toast.success("Servicio actualizado.");
      setEditing(false);
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    } finally {
      setSaving(false);
    }
  }

  async function togglePause() {
    setBusy(true);
    try {
      const action = service.status === "PAUSED" ? "resume" : "pause";
      await api.post(`/api/services/${id}/${action}`);
      toast.success(action === "pause" ? "Servicio pausado." : "Servicio reanudado.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar el estado.");
    } finally {
      setBusy(false);
    }
  }

  async function payNow() {
    if (!confirm("¿Pagar este servicio ahora?")) return;
    setBusy(true);
    try {
      await api.post(`/api/services/${id}/pay-now`);
      toast.success("Pago iniciado.");
      load();
      loadPayments();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo iniciar el pago.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("¿Eliminar este servicio? Esta acción no se puede deshacer.")) return;
    setBusy(true);
    try {
      await api.delete(`/api/services/${id}`);
      toast.success("Servicio eliminado.");
      router.push("/servicios");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar.");
      setBusy(false);
    }
  }

  if (!service || !form) {
    return (
      <Layout title="Servicio">
        <Spinner />
      </Layout>
    );
  }

  return (
    <Layout title="Servicio">
      <div className="page-header">
        <div>
          <Link href="/servicios" className="text-faint" style={{ fontSize: 13, textDecoration: "none" }}>
            ← Servicios
          </Link>
          <h1 className="page-title" style={{ marginTop: 6 }}>
            {service.biller?.logoEmoji || "🧾"} {service.customName || service.biller?.name}
          </h1>
          <div style={{ marginTop: 8 }}>
            <StatusBadge status={service.status} />
          </div>
        </div>
        <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
          <Button variant="secondary" loading={busy} onClick={togglePause}>
            <Icon name={service.status === "PAUSED" ? "play" : "pause"} size={15} />
            {service.status === "PAUSED" ? "Reanudar" : "Pausar"}
          </Button>
          <Button variant="secondary" loading={busy} onClick={payNow} disabled={service.status !== "ACTIVE"}>
            <Icon name="bolt" size={15} /> Pagar ahora
          </Button>
          <Button variant="danger" loading={busy} onClick={remove}>
            <Icon name="trash" size={15} /> Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-2">
        <Card padded={false}>
          <div style={{ padding: "20px 20px 0" }}>
            <CardHeader
              title="Detalles"
              action={
                !editing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    <Icon name="edit" size={14} /> Editar
                  </Button>
                )
              }
            />
          </div>
          <div className="card-pad" style={{ paddingTop: 4 }}>
            {editing ? (
              <div>
                <Input
                  id="customName"
                  label="Nombre"
                  value={form.customName}
                  onChange={(e) => setForm({ ...form, customName: e.target.value })}
                />
                <Input
                  id="reference"
                  label={service.biller?.referenceLabel || "Referencia"}
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                />
                {service.amountType === "FIXED" ? (
                  <CurrencyInput
                    id="fixedAmountCop"
                    label="Monto fijo"
                    value={form.fixedAmountCop}
                    onChange={(v) => setForm({ ...form, fixedAmountCop: v })}
                  />
                ) : (
                  <CurrencyInput
                    id="maxAmountCop"
                    label="Tope máximo"
                    value={form.maxAmountCop}
                    onChange={(v) => setForm({ ...form, maxAmountCop: v })}
                  />
                )}
                <div className="grid grid-2">
                  <Input
                    id="dueDay"
                    label="Día de vencimiento"
                    type="number"
                    value={form.dueDay}
                    onChange={(e) => setForm({ ...form, dueDay: e.target.value })}
                  />
                  <Input
                    id="payDaysBefore"
                    label="Días antes para pagar"
                    type="number"
                    value={form.payDaysBefore}
                    onChange={(e) => setForm({ ...form, payDaysBefore: e.target.value })}
                  />
                </div>
                <div className="flex gap-8" style={{ marginTop: 6 }}>
                  <Button variant="secondary" onClick={() => setEditing(false)}>Cancelar</Button>
                  <Button loading={saving} onClick={saveEdit}>Guardar cambios</Button>
                </div>
              </div>
            ) : (
              <dl style={{ margin: 0, fontSize: 13.5 }}>
                <DRow label={service.biller?.referenceLabel || "Referencia"} value={service.reference} />
                <DRow label="Categoría" value={service.category} />
                <DRow label="Frecuencia" value={FREQ_LABEL[service.frequency] || service.frequency} />
                <DRow label="Día de vencimiento" value={service.dueDay} />
                <DRow label="Próximo vencimiento" value={formatDate(service.nextDueDate)} />
                <DRow label="Pagar días antes" value={service.payDaysBefore} />
                <DRow
                  label={service.amountType === "FIXED" ? "Monto fijo" : "Tope máximo"}
                  value={formatCOP(service.amountType === "FIXED" ? service.fixedAmountCop : service.maxAmountCop || 0)}
                />
              </dl>
            )}
          </div>
        </Card>

        <Card padded={false}>
          <div style={{ padding: "20px 20px 0" }}>
            <CardHeader title="Historial de pagos" />
          </div>
          {!payments ? (
            <Spinner />
          ) : payments.length === 0 ? (
            <EmptyState icon="payments" title="Sin pagos aún" body="Aquí verás el historial de cobros de este servicio." />
          ) : (
            <div>
              {payments.map((p) => (
                <div className="list-row" key={p.id}>
                  <div className="list-row-main">
                    <div className="list-row-title">{formatCOP(p.totalCop || p.amountCop)}</div>
                    <div className="list-row-sub">{p.periodKey} · {formatDate(p.dueDate)}</div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}

function DRow({ label, value }) {
  return (
    <div className="flex justify-between" style={{ padding: "7px 0", borderBottom: "1px solid var(--color-border)" }}>
      <dt className="text-faint">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value ?? "—"}</dd>
    </div>
  );
}
