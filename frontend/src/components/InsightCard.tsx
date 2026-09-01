export function InsightCard({ title, body, icon = "◆" }: { title: string; body: string; icon?: string }) {
  return (
    <div className="insight-card">
      <span className="insight-icon" aria-hidden="true">{icon}</span>
      <div>
        <div className="insight-title">{title}</div>
        <div className="insight-body">{body}</div>
      </div>
    </div>
  );
}
