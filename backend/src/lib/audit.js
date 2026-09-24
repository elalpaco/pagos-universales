import prisma from "./prisma.js";

// Registra una entrada de auditoría. userId: dueño del recurso. actorId: quién ejecutó la acción
// (puede ser un admin actuando sobre otro usuario, o el propio sistema/scheduler = null).
export async function audit({ userId = null, actorId = null, action, entity, entityId, data }) {
  return prisma.auditLog.create({
    data: {
      userId,
      actorId,
      action,
      entity,
      entityId,
      data: data ?? undefined,
    },
  });
}
