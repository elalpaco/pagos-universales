import Icon from "./icons";

export default function EmptyState({ icon = "inbox", title, body, action }) {
  return (
    <div className="empty-state">
      <Icon name={icon} className="empty-state-icon" />
      <div className="empty-state-title">{title}</div>
      {body && <div className="empty-state-body">{body}</div>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
