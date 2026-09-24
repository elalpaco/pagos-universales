import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import Card from "../../components/Card";
import Button from "../../components/Button";
import Input from "../../components/Input";
import CurrencyInput from "../../components/CurrencyInput";
import Modal from "../../components/Modal";
import Spinner from "../../components/Spinner";
import EmptyState from "../../components/EmptyState";
import StatusBadge from "../../components/StatusBadge";
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

export default function ServiciosPage() {
  const { user } = useUser();
  const toast = useToast();
  const router = useRouter();
  const [services, setServices] = useState(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/api/services");
      setServices(res.services || res.items || res || []);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar tus servicios.");
    }
  }, [toast]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const active = (services || []).filter((s) => s.status !== "DELETED");

  return (
    <Layout title="Servicios">
      <div className="page-header">
        <div>
          <h1 className="page-title">Servicios</h1>
          <p className="page-subtitle">Suscripciones y facturas que se pagan solas.</p>
        </div>
        <Button onClick={() => setWizardOpen(true)}>
          <Icon name="plus" size={16} /> Agregar servicio
        </Button>
      </div>

      {!services ? (
        <Spinner />
      ) : active.length === 0 ? (
        <Card>
          <EmptyState
            icon="services"
            title="Sin servicios todavía"
            body="Agrega tu primer servicio para que empecemos a pagarlo automáticamente."
            action={<Button onClick={() => setWizardOpen(true)}>Agregar servicio</Button>}
          />
        </Card>
      ) : (
        <Card padded={false}>
          {active.map((s) => (
            <div
              className="list-row"
              key={s.id}
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/servicios/${s.id}`)}
            >
              <div className="list-row-icon">{s.biller?.logoEmoji || "🧾"}</div>
              <div className="list-row-main">
                <div className="list-row-title">{s.customName || s.biller?.name || "Servicio"}</div>
                <div className="list-row-sub">
                  {FREQ_LABEL[s.frequency] || s.frequency} · próximo cobro {formatDate(s.nextDueDate)}
                  {s.amountType === "FIXED" && s.fixedAmountCop ? ` · ${formatCOP(s.fixedAmountCop)}` : ""}
                </div>
              </div>
              <StatusBadge status={s.status} />
            </div>
          ))}
        </Card>
      )}

      <ServiceWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          setWizardOpen(false);
          load();
        }}
      />
    </Layout>
  );
}

const STEPS = ["Servicio", "Detalles", "Tarjeta", "Confirmar"];

function ServiceWizard({ open, onClose, onCreated }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [billers, setBillers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedBiller, setSelectedBiller] = useState(null);
  const [cards, setCards] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [details, setDetails] = useState({
    reference: "",
    amountType: "FIXED",
    fixedAmountCop: null,
    maxAmountCop: null,
    frequency: "MONTHLY",
    dueDay: "",
    payDaysBefore: 2,
    paymentMethodId: "",
    customName: "",
  });

  useEffect(() => {
    if (!open) {
      setStep(0);
      setQuery("");
      setCategory("");
      setSelectedBiller(null);
      setError("");
      setDetails({
        reference: "",
        amountType: "FIXED",
        fixedAmountCop: null,
        maxAmountCop: null,
        frequency: "MONTHLY",
        dueDay: "",
        payDaysBefore: 2,
        paymentMethodId: "",
        customName: "",
      });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function loadBillers() {
      try {
        const params = new URLSearchParams();
        if (query) params.set("q", query);
        if (category) params.set("category", category);
        const res = await api.get(`/api/billers?${params.toString()}`);
        const list = res.billers || res.items || res || [];
        if (!cancelled) {
          setBillers(list);
          if (!category) {
            const cats = Array.from(new Set(list.map((b) => b.category).filter(Boolean)));
            setCategories(cats);
          }
        }
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : "No se pudo cargar el catálogo.");
      }
    }
    loadBillers();
    return () => {
      cancelled = true;
    };
  }, [open, query, category, toast]);

  useEffect(() => {
    if (!open) return;
    async function loadCards() {
      try {
        const res = await api.get("/api/payment-methods");
        const list = (res.paymentMethods || res.items || res || []).filter((c) => c.status === "ACTIVE");
        setCards(list);
        const def = list.find((c) => c.isDefault);
        setDetails((d) => ({ ...d, paymentMethodId: def ? def.id : list[0]?.id || "" }));
      } catch {
        // ignore
      }
    }
    loadCards();
  }, [open]);

  function pickBiller(b) {
    setSelectedBiller(b);
    setDetails((d) => ({ ...d, amountType: b.amountType || "FIXED", customName: b.id === "otro" || b.name === "Otro" ? "" : d.customName }));
    setStep(1);
  }

  async function handleConfirm() {
    setError("");
    setSaving(true);
    try {
      const payload = {
        billerId: selectedBiller?.id,
        customName: details.customName || undefined,
        category: selectedBiller?.category,
        reference: details.reference,
        amountType: details.amountType,
        fixedAmountCop: details.amountType === "FIXED" ? details.fixedAmountCop : undefined,
        maxAmountCop: details.maxAmountCop || undefined,
        frequency: details.frequency,
        dueDay: Number(details.dueDay),
        payDaysBefore: Number(details.payDaysBefore) || 0,
        paymentMethodId: details.paymentMethodId || undefined,
      };
      await api.post("/api/services", payload);
      toast.success("Servicio agregado.");
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear el servicio.");
    } finally {
      setSaving(false);
    }
  }

  const canGoDetails = details.reference.trim().length > 0 && details.dueDay && (details.amountType === "VARIABLE" || details.fixedAmountCop > 0);

  return (
    <Modal open={open} onClose={onClose} title="Agregar servicio" width={560}>
      <div className="wizard-steps">
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: "contents" }}>
            <div className={`wizard-step ${i === step ? "active" : i < step ? "done" : ""}`}>
              <span className="wizard-step-num">{i < step ? <Icon name="check" size={12} /> : i + 1}</span>
              {label}
            </div>
            {i < STEPS.length - 1 && <span className="wizard-sep" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div>
          <Input
            id="search"
            placeholder="Buscar servicio (Netflix, EPM, Claro...)"
            prefix={<Icon name="search" size={14} />}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex gap-8" style={{ flexWrap: "wrap", marginBottom: 14 }}>
            <button className={`chip ${!category ? "active" : ""}`} onClick={() => setCategory("")}>
              Todas
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(c)}>
                {c}
              </button>
            ))}
          </div>
          <div className="grid" style={{ maxHeight: 320, overflowY: "auto", gap: 8 }}>
            {billers.length === 0 ? (
              <p className="text-muted" style={{ fontSize: 13.5 }}>No se encontraron servicios.</p>
            ) : (
              billers.map((b) => (
                <button key={b.id} className="biller-card" onClick={() => pickBiller(b)}>
                  <span className="biller-emoji">{b.logoEmoji || "🧾"}</span>
                  <span>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{b.name}</div>
                    <div className="text-faint" style={{ fontSize: 12.5 }}>{b.category}</div>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {step === 1 && selectedBiller && (
        <div>
          <div className="flex items-center gap-12" style={{ marginBottom: 16 }}>
            <span className="biller-emoji">{selectedBiller.logoEmoji || "🧾"}</span>
            <div>
              <div style={{ fontWeight: 700 }}>{selectedBiller.name}</div>
              <div className="text-faint" style={{ fontSize: 12.5 }}>{selectedBiller.category}</div>
            </div>
          </div>

          <Input
            id="customName"
            label="Nombre para identificarlo (opcional)"
            placeholder={selectedBiller.name}
            value={details.customName}
            onChange={(e) => setDetails({ ...details, customName: e.target.value })}
          />

          <Input
            id="reference"
            label={selectedBiller.referenceLabel || "Número de referencia"}
            required
            value={details.reference}
            onChange={(e) => setDetails({ ...details, reference: e.target.value })}
          />

          <div className="field">
            <label className="field-label">Tipo de monto</label>
            <div className="flex gap-8">
              <button
                type="button"
                className={`chip ${details.amountType === "FIXED" ? "active" : ""}`}
                onClick={() => setDetails({ ...details, amountType: "FIXED" })}
              >
                Monto fijo
              </button>
              <button
                type="button"
                className={`chip ${details.amountType === "VARIABLE" ? "active" : ""}`}
                onClick={() => setDetails({ ...details, amountType: "VARIABLE" })}
              >
                Monto variable
              </button>
            </div>
          </div>

          {details.amountType === "FIXED" ? (
            <CurrencyInput
              id="fixedAmountCop"
              label="Monto de cada cobro"
              value={details.fixedAmountCop}
              onChange={(v) => setDetails({ ...details, fixedAmountCop: v })}
            />
          ) : (
            <CurrencyInput
              id="maxAmountCop"
              label="Tope máximo autorizado"
              hint="Si la factura supera este monto, te pediremos aprobación antes de cobrar."
              value={details.maxAmountCop}
              onChange={(v) => setDetails({ ...details, maxAmountCop: v })}
            />
          )}

          <div className="grid grid-2">
            <div className="field">
              <label className="field-label" htmlFor="frequency">Frecuencia</label>
              <select
                id="frequency"
                className="input"
                value={details.frequency}
                onChange={(e) => setDetails({ ...details, frequency: e.target.value })}
              >
                {Object.entries(FREQ_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <Input
              id="dueDay"
              label="Día de vencimiento"
              type="number"
              min={1}
              max={31}
              required
              value={details.dueDay}
              onChange={(e) => setDetails({ ...details, dueDay: e.target.value })}
            />
          </div>

          <Input
            id="payDaysBefore"
            label="Pagar días antes del vencimiento"
            type="number"
            min={0}
            max={15}
            value={details.payDaysBefore}
            onChange={(e) => setDetails({ ...details, payDaysBefore: e.target.value })}
            hint="Recomendado: 2 días antes."
          />

          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStep(0)}>Atrás</Button>
            <Button disabled={!canGoDetails} onClick={() => setStep(2)}>Continuar</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
            Elige la tarjeta con la que se pagará este servicio.
          </p>
          {cards.length === 0 ? (
            <EmptyState icon="cards" title="No tienes tarjetas activas" body="Agrega una tarjeta primero en la sección Tarjetas." />
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              {cards.map((c) => (
                <button
                  key={c.id}
                  className={`card-tile ${details.paymentMethodId === c.id ? "selected" : ""}`}
                  onClick={() => setDetails({ ...details, paymentMethodId: c.id })}
                >
                  <div className="brand-mark">{(c.brand || "TARJ").slice(0, 4).toUpperCase()}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>•••• {c.last4}</div>
                    <div className="text-faint" style={{ fontSize: 12 }}>Vence {String(c.expMonth).padStart(2, "0")}/{c.expYear}</div>
                  </div>
                  {c.isDefault && <span className="badge badge-info" style={{ marginLeft: "auto" }}>Predeterminada</span>}
                </button>
              ))}
            </div>
          )}
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStep(1)}>Atrás</Button>
            <Button disabled={cards.length > 0 && !details.paymentMethodId} onClick={() => setStep(3)}>Continuar</Button>
          </div>
        </div>
      )}

      {step === 3 && selectedBiller && (
        <div>
          <Card className="card-pad" style={{ marginBottom: 16, background: "var(--color-surface-2)" }}>
            <div className="flex items-center gap-12" style={{ marginBottom: 10 }}>
              <span className="biller-emoji">{selectedBiller.logoEmoji || "🧾"}</span>
              <div style={{ fontWeight: 700 }}>{details.customName || selectedBiller.name}</div>
            </div>
            <dl style={{ margin: 0, fontSize: 13.5 }}>
              <Row label={selectedBiller.referenceLabel || "Referencia"} value={details.reference} />
              <Row label="Frecuencia" value={FREQ_LABEL[details.frequency]} />
              <Row label="Día de vencimiento" value={details.dueDay} />
              <Row
                label={details.amountType === "FIXED" ? "Monto fijo" : "Tope máximo"}
                value={formatCOP(details.amountType === "FIXED" ? details.fixedAmountCop || 0 : details.maxAmountCop || 0)}
              />
              <Row label="Pagar días antes" value={details.payDaysBefore} />
              <Row label="Tarjeta" value={cards.find((c) => c.id === details.paymentMethodId) ? `•••• ${cards.find((c) => c.id === details.paymentMethodId).last4}` : "Predeterminada"} />
            </dl>
          </Card>
          {error && <div className="field-error" style={{ marginBottom: 10 }}>{error}</div>}
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setStep(2)}>Atrás</Button>
            <Button loading={saving} onClick={handleConfirm}>Confirmar servicio</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between" style={{ padding: "5px 0" }}>
      <dt className="text-faint">{label}</dt>
      <dd style={{ margin: 0, fontWeight: 600 }}>{value}</dd>
    </div>
  );
}
