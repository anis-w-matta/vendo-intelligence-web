// Hover/focus tooltip surfacing any caveat on a metric - a sales-manager
// facing surface, so it never shows internal source tables or formulas,
// only the plain-language note (if any).
export function InfoTip({
  source,
  note,
}: {
  source: string;
  formula?: string;
  note?: string;
}) {
  if (!note) return null;
  const id = `info-${source}`.replace(/\W+/g, "-");
  return (
    <span className="info-tip">
      <button type="button" className="info-trigger" aria-describedby={id} aria-label="About this figure">
        i
      </button>
      <span role="tooltip" id={id} className="info-popover">
        {note}
      </span>
    </span>
  );
}
