import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../components/Layout";
import Card, { CardHeader } from "../components/Card";
import Button from "../components/Button";
import Input from "../components/Input";
import CurrencyInput from "../components/CurrencyInput";
import Spinner from "../components/Spinner";
import Icon from "../components/icons";
import { useToast } from "../components/Toast";
import { useUser } from "../lib/auth";
import api, { ApiError } from "../lib/api";

export default function PerfilPage() {
  const { user, refresh } = useUser();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        name: user.name || "",
        phone: user.phone || "",
        monthlyLimitCop: user.monthlyLimitCop ?? null,
        notifyEmail: user.notifyEmail ?? true,
      });
    }
  }, [user]);

  if (!form) {
    return (
      <Layout title="Perfil">
        <Spinner />
      </Layout>
    );
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.patch("/api/me", {
        name: form.name,
        phone: form.phone || undefined,
        monthlyLimitCop: form.monthlyLimitCop || undefined,
        notifyEmail: form.notifyEmail,
      });
      await refresh();
      toast.success("Perfil actualizado.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo actualizar el perfil.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Perfil">
      <div className="page-header">
        <div>
          <h1 className="page-title">Perfil</h1>
          <p className="page-subtitle">Tu información y límites de seguridad.</p>
        </div>
      </div>

      <div className="grid grid-2">
        <Card padded={false}>
          <div style={{ padding: "20px 20px 0" }}>
            <CardHeader title="Datos personales" />
          </div>
          <form className="card-pad" style={{ paddingTop: 4 }} onSubmit={save}>
            <Input
              id="email"
              label="Correo electrónico"
              value={user.email}
              disabled
            />
            <Input
              id="name"
              label="Nombre"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              id="phone"
              label="Teléfono (opcional)"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <CurrencyInput
              id="monthlyLimitCop"
              label="Tope mensual de autopagos"
              hint="Si el total del mes supera este valor, los cobros pasarán a aprobación."
              value={form.monthlyLimitCop}
              onChange={(v) => setForm({ ...form, monthlyLimitCop: v })}
            />
            <label className="checkbox-row" style={{ marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={form.notifyEmail}
                onChange={(e) => setForm({ ...form, notifyEmail: e.target.checked })}
              />
              Recibir notificaciones por correo
            </label>
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </form>
        </Card>

        {user.role === "ADMIN" && (
          <Card>
            <CardHeader title="Administración" />
            <p className="text-muted" style={{ fontSize: 13.5, marginBottom: 14 }}>
              Tienes permisos de administrador sobre Pagos Universales.
            </p>
            <Link href="/admin" className="btn btn-secondary">
              <Icon name="admin" size={15} /> Ir al panel de administración
            </Link>
          </Card>
        )}
      </div>
    </Layout>
  );
}
