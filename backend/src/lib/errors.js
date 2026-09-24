export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  badRequest: (message, details) => new ApiError(400, "BAD_REQUEST", message, details),
  unauthorized: (message = "No autenticado") => new ApiError(401, "UNAUTHORIZED", message),
  forbidden: (message = "No autorizado") => new ApiError(403, "FORBIDDEN", message),
  notFound: (message = "No encontrado") => new ApiError(404, "NOT_FOUND", message),
  conflict: (message = "Conflicto") => new ApiError(409, "CONFLICT", message),
  validation: (details) => new ApiError(400, "VALIDATION_ERROR", "Datos inválidos", details),
};

// Middleware de manejo de errores. Nunca loguea cuerpos de request.
export function errorHandler(err, req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  console.error("Error no manejado:", err?.message || err);
  return res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Error interno del servidor" },
  });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Ruta no encontrada" } });
}
