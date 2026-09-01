import type { ReactNode } from "react";
import type { ApiError } from "../../lib/api";

export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="stack">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 18, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title = "Nothing here yet", body }: { title?: string; body?: string }) {
  return (
    <div className="state-block" role="status">
      <div className="state-icon" aria-hidden="true">□</div>
      <div className="state-title">{title}</div>
      {body && <div>{body}</div>}
    </div>
  );
}

export function ErrorBanner({ error, onRetry }: { error: ApiError; onRetry?: () => void }) {
  return (
    <div className="banner banner-error" role="alert">
      <span aria-hidden="true">⚠</span>
      <div>
        <div>{error.message}</div>
        {onRetry && (
          <button type="button" className="btn btn-ghost" style={{ marginTop: 6, padding: "4px 10px" }} onClick={onRetry}>
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

export function PartialDataBanner({ note }: { note?: string }) {
  if (!note) return null;
  return (
    <div className="banner banner-partial" role="status">
      <span aria-hidden="true">◐</span>
      <span>{note}</span>
    </div>
  );
}

export function UnavailableBlock({ note, title = "Not available yet" }: { note: string; title?: string }) {
  return (
    <div className="state-block" role="status">
      <div className="state-icon" aria-hidden="true">○</div>
      <div className="state-title">{title}</div>
      <div>{note}</div>
    </div>
  );
}

export function CardShell({ children }: { children: ReactNode }) {
  return <div className="card">{children}</div>;
}
