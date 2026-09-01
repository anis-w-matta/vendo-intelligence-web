import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "./KpiCard";
import type { Metric } from "../lib/types";

const baseMetric: Metric<number> = {
  name: "Total Orders",
  value: 17,
  unit: "orders",
  period: null,
  filters: {},
  source: "catalog-service order_header",
  formula: "COUNT(DISTINCT (order_nb, order_type))",
  completeness: "COMPLETE",
  last_updated: "2026-09-01T17:00:00Z",
};

describe("KpiCard", () => {
  it("renders a normal value with its unit", () => {
    render(<KpiCard metric={baseMetric} />);
    expect(screen.getByText("17")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("never invents a value for an UNAVAILABLE metric, even if a stale number is present", () => {
    render(<KpiCard metric={{ ...baseMetric, completeness: "UNAVAILABLE", value: 999 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("999")).not.toBeInTheDocument();
  });

  it("renders null value as an em dash without a unit", () => {
    render(<KpiCard metric={{ ...baseMetric, value: null as unknown as number, completeness: "UNAVAILABLE" }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
