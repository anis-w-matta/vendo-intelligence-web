import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompletenessBadge } from "./CompletenessBadge";

describe("CompletenessBadge", () => {
  it.each([
    ["COMPLETE", "Complete"],
    ["PARTIAL", "Partial"],
    ["LIMITED", "Limited"],
    ["UNAVAILABLE", "Unavailable"],
  ] as const)("renders %s as %s", (status, label) => {
    render(<CompletenessBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
