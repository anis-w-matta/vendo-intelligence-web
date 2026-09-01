import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { RankingChart } from "./RankingChart";

// recharts' ResponsiveContainer needs a non-zero container size to render
// its children at all - jsdom reports 0x0 by default, so every recharts
// test needs this polyfill regardless of what's being asserted.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", { configurable: true, value: 600 });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, value: 300 });
  HTMLElement.prototype.getBoundingClientRect = () =>
    ({ width: 600, height: 300, top: 0, left: 0, right: 600, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
  // @ts-expect-error jsdom has no ResizeObserver
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function DestinationPage() {
  return <div>Salesman detail page</div>;
}

describe("RankingChart", () => {
  it("renders EmptyState for no rows", () => {
    render(
      <MemoryRouter>
        <RankingChart rows={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/no data for the current filters/i)).toBeInTheDocument();
  });

  it("navigates to a row's linkTo when its bar is clicked, and does nothing for rows without one", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes>
          <Route path="/dashboard" element={<RankingChart rows={[
            { label: "Ahmed", value: 10, linkTo: "/salesmen/sm_a" },
            { label: "Unattributed", value: 2 },
          ]} />} />
          <Route path="/salesmen/sm_a" element={<DestinationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelectorAll(".recharts-bar-rectangle .recharts-rectangle").length).toBe(2);
    });
    const bars = document.querySelectorAll(".recharts-bar-rectangle .recharts-rectangle");

    fireEvent.click(bars[0]);
    await waitFor(() => expect(screen.getByText("Salesman detail page")).toBeInTheDocument());
  });
});
