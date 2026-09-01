// Hover/focus tooltip surfacing a metric's source/formula/completeness
// note - "React must render authoritative metrics supplied by the API,"
// so this exists to show *where a number came from*, not to compute
// anything.
export function InfoTip({
  source,
  formula,
  note,
}: {
  source: string;
  formula?: string;
  note?: string;
}) {
  const id = `info-${source}-${formula ?? ""}`.replace(/\W+/g, "-");
  return (
    <span className="info-tip">
      <button type="button" className="info-trigger" aria-describedby={id} aria-label="Metric source and formula">
        i
      </button>
      <span role="tooltip" id={id} className="info-popover">
        <dl>
          <dt>Source</dt>
          <dd>{source}</dd>
          {formula && (
            <>
              <dt>Formula</dt>
              <dd>{formula}</dd>
            </>
          )}
          {note && (
            <>
              <dt>Note</dt>
              <dd>{note}</dd>
            </>
          )}
        </dl>
      </span>
    </span>
  );
}
