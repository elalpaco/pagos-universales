/** @type {import('next').NextConfig} */
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

const nextConfig = {
  reactStrictMode: true,
  // NOTA: no usamos output: "standalone" aquí. El Dockerfile corre `next start` (no
  // `node .next/standalone/server.js`), y en modo standalone las rewrites de next.config.js
  // (que dependen de BACKEND_URL) quedan congeladas en el routes-manifest generado en build
  // time — un BACKEND_URL distinto en runtime (docker-compose) no se aplicaría. Con `next
  // start`, next.config.js se vuelve a evaluar al arrancar el proceso, así que BACKEND_URL
  // pasado como variable de entorno del contenedor en runtime sí toma efecto.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` },
      { source: "/health", destination: `${BACKEND_URL}/health` },
    ];
  },
};

module.exports = nextConfig;
