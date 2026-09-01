import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityStateBadge } from "./ActivityStateBadge";

describe("ActivityStateBadge", () => {
  it.each([
    ["New", "badge-complete"],
    ["Active", "badge-complete"],
    ["Stable", "badge-complete"],
    ["Declining", "badge-partial"],
    ["Dormant", "badge-partial"],
    ["Insufficient Data", "badge-unavailable"],
  ] as const)("renders %s with the %s tone", (state, expectedClass) => {
    render(<ActivityStateBadge state={state} />);
    const el = screen.getByText(state);
    expect(el.className).toContain(expectedClass);
  });
});
