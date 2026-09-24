import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Logo from "../components/Logo";
import Input from "../components/Input";
import Button from "../components/Button";
import api, { ApiError } from "../lib/api";
import { useUser } from "../lib/auth";

export default function RegistroPage() {
  const router = useRouter();
  const { refresh } = useUser();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/register", form);
      try {
        await api.post("/api/auth/login", { email: form.email, password: form.password });
      } catch {
        // if register already logs in via cookie this is a harmless no-op fallback
      }
      await refresh();
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("No se pudo completar el registro.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <Logo />
          <span>Pagos Universales</span>
        </div>
        <h1 className="auth-title">Crea tu cuenta</h1>
        <p className="auth-subtitle">Deja que tus pagos ocurran solos</p>

        <form onSubmit={handleSubmit}>
          <Input
            id="name"
            label="Nombre"
            required
            autoComplete="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <Input
            id="email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <Input
            id="password"
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required
            hint="Mínimo 8 caracteres"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <div className="field-error" style={{ marginBottom: 14 }}>{error}</div>}
          <Button type="submit" block loading={loading}>
            Crear cuenta
          </Button>
        </form>

        <div className="auth-footer">
          ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
        </div>
      </div>
    </div>
  );
}
