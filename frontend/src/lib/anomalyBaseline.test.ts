import { describe, expect, it } from "vitest";
import {
  DEVIATION_THRESHOLD_PCT,
  MIN_SAMPLE_SIZE,
  detectBaselineAnomaly,
  detectFleetBaselineAnomalies,
  type DailyTrendPoint,
} from "./anomalyBaseline";

// Builds `priorDays` consecutive days (all worth `priorValue`) ending the
// day before `currentBucket`, plus the current day itself worth
// `currentValue`. Every point lands inside both the 7-day and 30-day
// windows for small `priorDays`, and inside only the 30-day window for
// larger ones - exactly the shape a real daily trend series has.
function daysBefore(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function buildSeries(
  priorDays: number,
  priorValue: number,
  currentValue: number,
  currentBucket = "2026-02-25",
): DailyTrendPoint[] {
  const points: DailyTrendPoint[] = [];
  for (let i = priorDays; i >= 1; i--) {
    points.push({ bucket: daysBefore(currentBucket, i), value: priorValue });
  }
  points.push({ bucket: currentBucket, value: currentValue });
  return points;
}

describe("documented constants", () => {
  it("thresholds match what the module documents", () => {
    expect(DEVIATION_THRESHOLD_PCT).toBe(30);
    expect(MIN_SAMPLE_SIZE[7]).toBe(5);
    expect(MIN_SAMPLE_SIZE[30]).toBe(20);
  });
});

describe("detectBaselineAnomaly - sample size gate", () => {
  it("returns null with fewer than 2 parseable points", () => {
    expect(detectBaselineAnomaly([], 7, "order volume")).toBeNull();
    expect(detectBaselineAnomaly([{ bucket: "2026-02-25", value: 10 }], 7, "order volume")).toBeNull();
  });

  it("ignores unparseable bucket strings rather than crashing", () => {
    const series: DailyTrendPoint[] = [
      { bucket: "2026-02", value: 10 }, // month-only, not day-granular - must be skipped, not fatal
      { bucket: "2026-02-25", value: 100 },
    ];
    expect(detectBaselineAnomaly(series, 7, "order volume")).toBeNull();
  });

  it("does not compute a 7-day baseline from only 3 real prior days (min 5)", () => {
    const series = buildSeries(3, 10, 100); // 3 prior days, way below MIN_SAMPLE_SIZE[7]
    expect(detectBaselineAnomaly(series, 7, "order volume")).toBeNull();
  });

  it("computes a 7-day baseline once exactly 5 real prior days are present", () => {
    const series = buildSeries(5, 10, 100); // 5 prior days at value 10, current 100 -> well past threshold
    const signal = detectBaselineAnomaly(series, 7, "order volume");
    expect(signal).not.toBeNull();
    expect(signal!.sampleSize).toBe(5);
  });

  it("does not compute a 30-day baseline from only 12 real prior days (min 20)", () => {
    const series = buildSeries(12, 10, 100);
    expect(detectBaselineAnomaly(series, 30, "order volume")).toBeNull();
  });

  it("computes a 30-day baseline once exactly 20 real prior days are present", () => {
    const series = buildSeries(20, 10, 100);
    const signal = detectBaselineAnomaly(series, 30, "order volume");
    expect(signal).not.toBeNull();
    expect(signal!.sampleSize).toBe(20);
  });
});

describe("detectBaselineAnomaly - deviation gate", () => {
  it("does not flag a mild change within +-30%", () => {
    // 25 prior days at 10, current 12 -> +20%, sufficient sample, within threshold
    const series = buildSeries(25, 10, 12);
    expect(detectBaselineAnomaly(series, 30, "order volume")).toBeNull();
  });

  it("does not flag exactly at the 30% boundary (must exceed, not just meet)", () => {
    const series = buildSeries(25, 10, 13); // +30% exactly
    expect(detectBaselineAnomaly(series, 30, "order volume")).toBeNull();
  });

  it("never fabricates a comparison against a zero/negative baseline", () => {
    const series = buildSeries(25, 0, 100);
    expect(detectBaselineAnomaly(series, 30, "order volume")).toBeNull();
  });
});

describe("detectBaselineAnomaly - real signal, full evidence", () => {
  it("flags a spike with every evidence field populated", () => {
    // 25 prior days at 10 (mean 10), current 15 -> +50%
    const series = buildSeries(25, 10, 15, "2026-02-25");
    const signal = detectBaselineAnomaly(series, 30, "fleet item quantity");
    expect(signal).toEqual({
      type: "baseline_deviation",
      metricLabel: "fleet item quantity",
      windowDays: 30,
      currentValue: 15,
      currentPeriod: { from: "2026-02-25", to: "2026-02-25" },
      baselineValue: 10,
      baselinePeriod: { from: "2026-01-31", to: "2026-02-24" },
      sampleSize: 25,
      differenceAbs: 5,
      differencePct: 50,
      direction: "above",
      reason:
        "Investigate: current fleet item quantity 15; baseline (30-day avg) 10; +50.0%; unusually high fleet item quantity.",
    });
  });

  it("flags a drop with direction 'below' and a matching reason", () => {
    // 6 prior days at 10 (mean 10, sample 6 >= MIN_SAMPLE_SIZE[7]=5), current 4 -> -60%
    const series = buildSeries(6, 10, 4);
    const signal = detectBaselineAnomaly(series, 7, "order volume");
    expect(signal).not.toBeNull();
    expect(signal!.direction).toBe("below");
    expect(signal!.differencePct).toBeCloseTo(-60, 5);
    expect(signal!.reason).toMatch(/unusually low order volume/);
    expect(signal!.reason).toMatch(/-60\.0%/);
  });

  it("matches the phase spec's own example format", () => {
    // "Current orders 12; baseline (30-day avg) 8.2; +46.3%; unusually high order volume"
    const series: DailyTrendPoint[] = [];
    const values = [...Array(16).fill(8), ...Array(4).fill(9)]; // sum 164, n=20 -> mean 8.2
    for (let i = values.length; i >= 1; i--) {
      series.push({ bucket: daysBefore("2026-03-01", i), value: values[values.length - i] });
    }
    series.push({ bucket: "2026-03-01", value: 12 });
    const signal = detectBaselineAnomaly(series, 30, "order volume");
    expect(signal).not.toBeNull();
    expect(signal!.currentValue).toBe(12);
    expect(signal!.baselineValue).toBeCloseTo(8.2, 5);
    expect(signal!.differencePct).toBeCloseTo(46.34146, 3);
    expect(signal!.reason).toBe(
      "Investigate: current order volume 12; baseline (30-day avg) 8.2; +46.3%; unusually high order volume.",
    );
  });

  it("is robust to an unsorted input series (sorts by date before comparing)", () => {
    const sorted = buildSeries(25, 10, 15);
    const shuffled = [...sorted].reverse();
    expect(detectBaselineAnomaly(shuffled, 30, "order volume")).toEqual(
      detectBaselineAnomaly(sorted, 30, "order volume"),
    );
  });
});

describe("reason string stays reconstructable from its own fields (anti-drift check)", () => {
  it("every number quoted in `reason` matches the sibling numeric fields", () => {
    const series = buildSeries(25, 20, 30); // +50%
    const signal = detectBaselineAnomaly(series, 30, "request volume")!;
    expect(signal).not.toBeNull();

    const match = signal.reason.match(
      /^Investigate: current request volume ([\d.]+); baseline \(30-day avg\) ([\d.]+); ([+-][\d.]+)%; unusually (high|low) request volume\.$/,
    );
    expect(match).not.toBeNull();
    const [, current, baseline, pct, direction] = match!;
    expect(Number(current)).toBe(signal.currentValue);
    expect(Number(baseline)).toBe(signal.baselineValue);
    expect(Number(pct)).toBeCloseTo(signal.differencePct, 1);
    expect(direction).toBe(signal.direction === "above" ? "high" : "low");
  });
});

describe("detectFleetBaselineAnomalies", () => {
  it("returns an empty array when neither window fires", () => {
    const series = buildSeries(25, 10, 11); // +10%, within threshold both windows
    expect(detectFleetBaselineAnomalies(series, "order volume")).toEqual([]);
  });

  it("returns only the windows with enough sample size AND a real deviation", () => {
    // Only 6 prior days total -> 7-day window has sample 6 (fires), 30-day window has sample 6 < 20 (never fires)
    const series = buildSeries(6, 10, 20); // +100%
    const signals = detectFleetBaselineAnomalies(series, "order volume");
    expect(signals.map((s) => s.windowDays)).toEqual([7]);
  });

  it("can return both windows when both have enough sample size and both deviate", () => {
    const series = buildSeries(25, 10, 20); // +100%, sample 25 >= both MIN_SAMPLE_SIZE[7] and [30]
    const signals = detectFleetBaselineAnomalies(series, "order volume");
    expect(signals.map((s) => s.windowDays).sort((a, b) => a - b)).toEqual([7, 30]);
  });
});
