const STATUS_MAP = {
  SCHEDULED: { label: "Programado", tone: "info" },
  PENDING_APPROVAL: { label: "Pendiente de aprobación", tone: "warning" },
  CHARGING: { label: "Cobrando", tone: "info" },
  CHARGED: { label: "Cobrado", tone: "info" },
  DISBURSING: { label: "Desembolsando", tone: "warning" },
  PAID: { label: "Pagado", tone: "success" },
  FAILED: { label: "Fallido", tone: "danger" },
  SKIPPED: { label: "Omitido", tone: "neutral" },
  REFUND_PENDING: { label: "Reembolso pendiente", tone: "warning" },
  REFUNDED: { label: "Reembolsado", tone: "neutral" },
  // Service status
  ACTIVE: { label: "Activo", tone: "success" },
  PAUSED: { label: "Pausado", tone: "neutral" },
  DELETED: { label: "Eliminado", tone: "danger" },
  // PaymentMethod status
  EXPIRED: { label: "Vencida", tone: "danger" },
  REMOVED: { label: "Eliminada", tone: "neutral" },
};

export default function StatusBadge({ status }) {
  const info = STATUS_MAP[status] || { label: status || "—", tone: "neutral" };
  return (
    <span className={`badge badge-${info.tone}`}>
      <span className="badge-dot" />
      {info.label}
    </span>
  );
}

export { STATUS_MAP };
