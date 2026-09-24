// Thin fetch wrapper for the Pagos Universales API.
// All calls go through same-origin `/api/*` (see next.config.js rewrites),
// so the httpOnly `pu_token` cookie travels automatically.

export class ApiError extends Error {
  constructor(code, message, details, status) {
    super(message || code || "Error desconocido");
    this.code = code || "UNKNOWN";
    this.details = details;
    this.status = status;
  }
}

async function request(path, { method = "GET", body, headers, ...rest } = {}) {
  let res;
  try {
    res = await fetch(path.startsWith("/") ? path : `/${path}`, {
      method,
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...rest,
    });
  } catch (err) {
    throw new ApiError(
      "NETWORK_ERROR",
      "No se pudo conectar con el servidor. Revisa tu conexión.",
      undefined,
      0
    );
  }

  let data = null;
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const err = data && data.error;
    throw new ApiError(
      err?.code || `HTTP_${res.status}`,
      err?.message || "Ocurrió un error inesperado.",
      err?.details,
      res.status
    );
  }

  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: "GET" }),
  post: (path, body, opts) => request(path, { ...opts, method: "POST", body }),
  patch: (path, body, opts) => request(path, { ...opts, method: "PATCH", body }),
  delete: (path, opts) => request(path, { ...opts, method: "DELETE" }),
};

export default api;
