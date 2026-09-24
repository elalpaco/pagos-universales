import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import Logo from "../components/Logo";
import Input from "../components/Input";
import Button from "../components/Button";
import api, { ApiError } from "../lib/api";
import { useUser } from "../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { refresh } = useUser();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/login", form);
      await refresh();
      router.push("/");
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("No se pudo iniciar sesión.");
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
        <h1 className="auth-title">Inicia sesión</h1>
        <p className="auth-subtitle">Administra tus pagos automáticos</p>

        <form onSubmit={handleSubmit}>
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
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {error && <div className="field-error" style={{ marginBottom: 14 }}>{error}</div>}
          <Button type="submit" block loading={loading}>
            Iniciar sesión
          </Button>
        </form>

        <div className="auth-footer">
          ¿No tienes cuenta? <Link href="/registro">Regístrate</Link>
        </div>
      </div>
    </div>
  );
}
