import { describe, expect, it } from "vitest";
import { bucketByWeek, bucketByWeekAndStatus, totalsByDay, weekStartOf } from "./weekBucketing";

describe("weekStartOf", () => {
  it("returns the same date for a Monday", () => {
    expect(weekStartOf("2026-03-02")).toBe("2026-03-02"); // a Monday
  });

  it("returns the prior Monday for a mid-week date", () => {
    expect(weekStartOf("2026-03-05")).toBe("2026-03-02"); // Thursday
  });

  it("returns the prior Monday for a Sunday (end of the ISO week)", () => {
    expect(weekStartOf("2026-03-08")).toBe("2026-03-02"); // Sunday
  });

  it("uses UTC, not local time, for the day boundary", () => {
    // 2026-03-02T23:00:00Z is still Monday in UTC even if local time rolls
    // over - the backend's day buckets are UTC (date_trunc('day', ...)).
    expect(weekStartOf("2026-03-02T23:00:00Z")).toBe("2026-03-02");
  });

  it("handles a year boundary", () => {
    expect(weekStartOf("2026-01-01")).toBe("2025-12-29"); // Thursday -> prior Monday
  });
});

describe("bucketByWeek", () => {
  it("sums same-week day counts into one week bucket", () => {
    const result = bucketByWeek([
      { day: "2026-03-02", count: 3 }, // Mon
      { day: "2026-03-04", count: 5 }, // Wed
      { day: "2026-03-08", count: 2 }, // Sun, same ISO week as above
    ]);
    expect(result).toEqual([{ weekStart: "2026-03-02", count: 10 }]);
  });

  it("splits counts across week boundaries", () => {
    const result = bucketByWeek([
      { day: "2026-03-08", count: 2 }, // week of 03-02
      { day: "2026-03-09", count: 4 }, // week of 03-09
    ]);
    expect(result).toEqual([
      { weekStart: "2026-03-02", count: 2 },
      { weekStart: "2026-03-09", count: 4 },
    ]);
  });

  it("returns an empty array for no input", () => {
    expect(bucketByWeek([])).toEqual([]);
  });

  it("sorts output by week ascending regardless of input order", () => {
    const result = bucketByWeek([
      { day: "2026-03-16", count: 1 },
      { day: "2026-03-02", count: 1 },
      { day: "2026-03-09", count: 1 },
    ]);
    expect(result.map((r) => r.weekStart)).toEqual(["2026-03-02", "2026-03-09", "2026-03-16"]);
  });

  it("never fabricates a count - the sum exactly matches the day-level input", () => {
    const points = [
      { day: "2026-03-02", count: 3 },
      { day: "2026-03-03", count: 7 },
      { day: "2026-03-04", count: 11 },
    ];
    const totalIn = points.reduce((s, p) => s + p.count, 0);
    const totalOut = bucketByWeek(points).reduce((s, p) => s + p.count, 0);
    expect(totalOut).toBe(totalIn);
  });
});

describe("bucketByWeekAndStatus", () => {
  it("keeps status as a separate dimension within a week", () => {
    const result = bucketByWeekAndStatus([
      { day: "2026-03-02", status: "new", count: 2 },
      { day: "2026-03-03", status: "new", count: 3 },
      { day: "2026-03-03", status: "committed", count: 1 },
    ]);
    expect(result).toEqual([
      { weekStart: "2026-03-02", status: "committed", count: 1 },
      { weekStart: "2026-03-02", status: "new", count: 5 },
    ]);
  });

  it("returns an empty array for no input", () => {
    expect(bucketByWeekAndStatus([])).toEqual([]);
  });
});

describe("totalsByDay", () => {
  it("sums across statuses within the same day", () => {
    const result = totalsByDay([
      { day: "2026-03-02", status: "new", count: 2 },
      { day: "2026-03-02", status: "committed", count: 1 },
      { day: "2026-03-03", status: "new", count: 4 },
    ]);
    expect(result).toEqual([
      { day: "2026-03-02", count: 3 },
      { day: "2026-03-03", count: 4 },
    ]);
  });

  it("returns an empty array for no input", () => {
    expect(totalsByDay([])).toEqual([]);
  });
});
