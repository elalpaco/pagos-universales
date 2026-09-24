#!/usr/bin/env bash
# Corre PAGOS-UNIVERSALES localmente sin Docker: levanta (o reutiliza) un Postgres local,
# aplica migraciones + seed, y arranca backend (puerto 4000) y frontend (puerto 3000).
#
# Requiere: Node 20+, npm, y un servidor Postgres 16 disponible en el PATH
# (pg_lsclusters/service/initdb, según el sistema).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

PG_USER="${PG_USER:-postgres}"
PG_PASSWORD="${PG_PASSWORD:-postgres}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
PG_DB="${PG_DB:-pagos_universales}"

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT}/${PG_DB}"
export NODE_ENV="${NODE_ENV:-development}"
export PORT="${PORT:-4000}"
export TZ="America/Bogota"
export JWT_SECRET="${JWT_SECRET:-dev-jwt-secret-change-me-0000000000}"
export ENCRYPTION_KEY="${ENCRYPTION_KEY:-dev-encryption-key-change-me-0000}"
export ALLOW_SIGNUP="${ALLOW_SIGNUP:-true}"
export PAYMENT_GATEWAY="${PAYMENT_GATEWAY:-simulated}"
export SCHEDULER_ENABLED="${SCHEDULER_ENABLED:-true}"
export SCHEDULER_CRON="${SCHEDULER_CRON:-*/5 * * * *}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-diego@pelletier.com.co}"
export ADMIN_NAME="${ADMIN_NAME:-Diego}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-CambiaEsta123!}"
export BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"

echo "== 1) Verificando Postgres local en ${PG_HOST}:${PG_PORT} =="
if command -v pg_isready >/dev/null 2>&1 && pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null 2>&1; then
  echo "Postgres ya está corriendo."
else
  if command -v service >/dev/null 2>&1; then
    echo "Iniciando Postgres con 'service postgresql start'..."
    sudo service postgresql start 2>/dev/null || service postgresql start
  else
    echo "No se encontró Postgres corriendo y no se pudo iniciar automáticamente."
    echo "Inicia tu servidor Postgres 16 manualmente en ${PG_HOST}:${PG_PORT} y vuelve a correr este script."
    exit 1
  fi
  sleep 2
fi

echo "== 2) Asegurando rol y bases de datos =="
export PGPASSWORD="$PG_PASSWORD"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -tc "SELECT 1" >/dev/null 2>&1 || {
  echo "No se pudo conectar como ${PG_USER}. Ajusta PG_USER/PG_PASSWORD o crea el rol manualmente."
  exit 1
}
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" | grep -q 1 \
  || psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c "CREATE DATABASE ${PG_DB};"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -tc "SELECT 1 FROM pg_database WHERE datname='pagos_test'" | grep -q 1 \
  || psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -c "CREATE DATABASE pagos_test;"

echo "== 3) Instalando dependencias =="
(cd "$BACKEND_DIR" && npm install)
(cd "$FRONTEND_DIR" && npm install)

echo "== 4) Migraciones + seed del backend =="
(cd "$BACKEND_DIR" && npx prisma migrate deploy && node prisma/seed.js)

echo "== 5) Arrancando backend (:${PORT}) y frontend (:3000) =="
(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!
(cd "$FRONTEND_DIR" && BACKEND_URL="$BACKEND_URL" npm run dev) &
FRONTEND_PID=$!

trap 'echo "Deteniendo..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true' EXIT INT TERM

echo "Backend:  http://localhost:${PORT}"
echo "Frontend: http://localhost:3000"
echo "Admin:    ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}"
wait
