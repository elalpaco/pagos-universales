import { useCallback, useEffect, useState } from "react";
import Layout from "../components/Layout";
import Card, { CardHeader } from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";

const BRAND_LABEL = {
  visa: "VISA",
  mastercard: "MC",
  amex: "AMEX",
};

function CardTile({ pm, onSetDefault, onRemove, busy }) {
  return (
    <div className="card-tile" style={{ cursor: "default", marginBottom: 12 }}>
      <div className="brand-mark">{BRAND_LABEL[(pm.brand || "").toLowerCase()] || (pm.brand || "TARJ").slice(0, 4).toUpperCase()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="list-row-title">•••• •••• •••• {pm.last4}</div>
        <div className="list-row-sub">
          Vence {String(pm.expMonth).padStart(2, "0")}/{pm.expYear} · {pm.holderName}
        </div>
      </div>
      <div className="flex items-center gap-8">
        {pm.isDefault ? (
          <span className="badge badge-info">Predeterminada</span>
        ) : (
          pm.status === "ACTIVE" && (
            <Button size="sm" variant="secondary" loading={busy === pm.id} onClick={() => onSetDefault(pm.id)}>
              Hacer predeterminada
            </Button>
          )
        )}
        <StatusBadge status={pm.status} />
        {pm.status === "ACTIVE" && (
          <button
            className="btn btn-ghost btn-sm"
            aria-label="Eliminar tarjeta"
            onClick={() => onRemove(pm.id)}
            disabled={busy === pm.id}
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TarjetasPage() {
  const { user } = useUser();
  const toast = useToast();
  const [cards, setCards] = useState(null);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cardsRes, configRes] = await Promise.all([
        api.get("/api/payment-methods"),
        api.get("/api/config"),
      ]);
      setCards(cardsRes.paymentMethods || cardsRes.items || cardsRes || []);
      setConfig(configRes);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudieron cargar las tarjetas.");
    }
  }, [toast]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function setDefault(id) {
    setBusy(id);
    try {
      await api.patch(`/api/payment-methods/${id}/default`);
      toast.success("Tarjeta predeterminada actualizada.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id) {
    if (!confirm("¿Eliminar esta tarjeta?")) return;
    setBusy(id);
    try {
      await api.delete(`/api/payment-methods/${id}`);
      toast.success("Tarjeta eliminada.");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo eliminar.");
    } finally {
      setBusy(null);
    }
  }

  const activeCards = (cards || []).filter((c) => c.status !== "REMOVED");

  return (
    <Layout title="Tarjetas">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tarjetas</h1>
          <p className="page-subtitle">Medios de pago para tus cobros automáticos.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" size={16} /> Agregar tarjeta
        </Button>
      </div>

      {!cards ? (
        <Spinner />
      ) : activeCards.length === 0 ? (
        <Card>
          <EmptyState
            icon="cards"
            title="Aún no tienes tarjetas"
            body="Agrega una tarjeta para poder activar servicios que se paguen solos."
            action={<Button onClick={() => setModalOpen(true)}>Agregar tarjeta</Button>}
          />
        </Card>
      ) : (
        <div>
          {activeCards.map((pm) => (
            <CardTile key={pm.id} pm={pm} onSetDefault={setDefault} onRemove={remove} busy={busy} />
          ))}
        </div>
      )}

      <AddCardModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        config={config}
        onAdded={() => {
          setModalOpen(false);
          load();
        }}
      />
    </Layout>
  );
}

function AddCardModal({ open, onClose, config, onAdded }) {
  const toast = useToast();
  const [form, setForm] = useState({ number: "", expMonth: "", expYear: "", cvc: "", holderName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setForm({ number: "", expMonth: "", expYear: "", cvc: "", holderName: "" });
      setError("");
    }
  }, [open]);

  const gateway = config?.gateway || "simulated";

  async function submitSimulated(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/payment-methods/simulated", {
        number: form.number.replace(/\s+/g, ""),
        expMonth: Number(form.expMonth),
        expYear: Number(form.expYear),
        cvc: form.cvc,
        holderName: form.holderName,
      });
      toast.success("Tarjeta agregada.");
      setForm({ number: "", expMonth: "", expYear: "", cvc: "", holderName: "" });
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo agregar la tarjeta.");
    } finally {
      setLoading(false);
      // never keep card data in state longer than necessary
      setForm({ number: "", expMonth: "", expYear: "", cvc: "", holderName: "" });
    }
  }

  async function submitWompi(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const wompiApiUrl = config?.wompiApiUrl || "https://production.wompi.co/v1";
      const tokenRes = await fetch(`${wompiApiUrl}/tokens/cards`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config?.wompiPublicKey}`,
        },
        body: JSON.stringify({
          number: form.number.replace(/\s+/g, ""),
          exp_month: String(form.expMonth).padStart(2, "0"),
          exp_year: String(form.expYear).slice(-2),
          cvc: form.cvc,
          card_holder: form.holderName,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData?.data?.id) {
        throw new Error(tokenData?.error?.messages ? JSON.stringify(tokenData.error.messages) : "La pasarela rechazó la tarjeta.");
      }
      await api.post("/api/payment-methods", { token: tokenData.data.id });
      toast.success("Tarjeta agregada.");
      onAdded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err.message || "No se pudo tokenizar la tarjeta.");
    } finally {
      setLoading(false);
      setForm({ number: "", expMonth: "", expYear: "", cvc: "", holderName: "" });
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Agregar tarjeta">
      {gateway === "simulated" ? (
        <div className="test-cards-box">
          <h4>Modo de pruebas — usa una de estas tarjetas</h4>
          <ul>
            <li><code>4111 1111 1111 1111</code> — aprueba</li>
            <li><code>4000 0000 0000 0002</code> — declina</li>
            <li><code>4000 0000 0000 9995</code> — fondos insuficientes</li>
          </ul>
        </div>
      ) : (
        <p className="text-muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Tu tarjeta se tokeniza directamente con Wompi. Nunca enviamos tu número completo a nuestros servidores.
        </p>
      )}

      <form onSubmit={gateway === "wompi" ? submitWompi : submitSimulated}>
        <Input
          id="holderName"
          label="Nombre del titular"
          required
          autoComplete="cc-name"
          value={form.holderName}
          onChange={(e) => setForm({ ...form, holderName: e.target.value })}
        />
        <Input
          id="number"
          label="Número de tarjeta"
          required
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="4111 1111 1111 1111"
          value={form.number}
          onChange={(e) => setForm({ ...form, number: e.target.value })}
        />
        <div className="grid grid-3">
          <Input
            id="expMonth"
            label="Mes"
            required
            inputMode="numeric"
            placeholder="MM"
            maxLength={2}
            autoComplete="cc-exp-month"
            value={form.expMonth}
            onChange={(e) => setForm({ ...form, expMonth: e.target.value })}
          />
          <Input
            id="expYear"
            label="Año"
            required
            inputMode="numeric"
            placeholder="AAAA"
            maxLength={4}
            autoComplete="cc-exp-year"
            value={form.expYear}
            onChange={(e) => setForm({ ...form, expYear: e.target.value })}
          />
          <Input
            id="cvc"
            label="CVC"
            required
            inputMode="numeric"
            placeholder="123"
            maxLength={4}
            autoComplete="cc-csc"
            value={form.cvc}
            onChange={(e) => setForm({ ...form, cvc: e.target.value })}
          />
        </div>
        {error && <div className="field-error" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Guardar tarjeta
          </Button>
        </div>
      </form>
    </Modal>
  );
}
