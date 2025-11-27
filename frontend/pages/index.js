import { useEffect, useState } from "react";

export default function Home() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");

  const checkHealth = async () => {
    try {
      setError("");
      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

      const res = await fetch(`${apiUrl}/health`);
      if (!res.ok) {
        throw new Error("Respuesta no OK del backend");
      }
      const data = await res.json();
      setHealth(data);
    } catch (err) {
      console.error(err);
      setHealth(null);
      setError("No se pudo conectar al backend");
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  return (
    <main
      style={{
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        padding: "2rem",
        maxWidth: "800px",
        margin: "0 auto",
      }}
    >
      <h1>PAGOS-UNIVERSALES</h1>
      <p>Frontend Next.js funcionando. Prueba la conexión con el backend.</p>

      <p>
        <strong>Backend URL:</strong>{" "}
        {process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}
      </p>

      <button
        onClick={checkHealth}
        style={{
          padding: "0.5rem 1rem",
          borderRadius: "6px",
          border: "1px solid #ddd",
          cursor: "pointer",
          marginBottom: "1rem",
        }}
      >
        Volver a consultar /health
      </button>

      {health && (
        <pre
          style={{
            background: "#111",
            color: "#0f0",
            padding: "1rem",
            borderRadius: "6px",
            overflowX: "auto",
          }}
        >
          {JSON.stringify(health, null, 2)}
        </pre>
      )}

      {error && (
        <p style={{ color: "red", marginTop: "1rem" }}>
          {error}
        </p>
      )}
    </main>
  );
}
