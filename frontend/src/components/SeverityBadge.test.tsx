import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SeverityBadge } from "./SeverityBadge";

describe("SeverityBadge", () => {
  it.each([
    ["INFO", "Info", "badge-severity-info"],
    ["WATCH", "Watch", "badge-severity-watch"],
    ["WARNING", "Warning", "badge-severity-warning"],
    ["CRITICAL", "Critical", "badge-severity-critical"],
  ] as const)("renders %s as %s with class %s", (severity, label, className) => {
    render(<SeverityBadge severity={severity} />);
    const el = screen.getByText(label);
    expect(el).toBeInTheDocument();
    expect(el.className).toContain(className);
  });
});
