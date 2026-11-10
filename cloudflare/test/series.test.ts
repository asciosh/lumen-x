import { describe, expect, it } from "vitest";
import { prepareSeries } from "../src/engine/series";
import { SeriesError } from "../src/engine/types";

const p = (date: string, quantity: number) => ({ date, quantity });

describe("prepareSeries", () => {
  it("sorts the days and returns one value per day", () => {
    const s = prepareSeries([p("2025-01-03", 3), p("2025-01-01", 1), p("2025-01-02", 2)]);
    expect(s.values).toEqual([1, 2, 3]);
    expect(s.lastDate).toBe("2025-01-03");
    expect(s.filled).toBe(0);
  });

  it("fills a gap by linear interpolation and counts it", () => {
    const pts = [p("2025-01-01", 10), p("2025-01-02", 20)];
    for (let d = 5; d <= 30; d++) pts.push(p(`2025-01-${String(d).padStart(2, "0")}`, 100));
    // missing: 3rd and 4th of January -> 20 -> 100 over three steps
    const s = prepareSeries(pts);
    expect(s.filled).toBe(2);
    expect(s.values[2]).toBeCloseTo(20 + 80 / 3, 9);
    expect(s.values[3]).toBeCloseTo(20 + (80 * 2) / 3, 9);
  });

  it("rejects duplicate dates", () => {
    expect(() => prepareSeries([p("2025-01-01", 1), p("2025-01-01", 2)])).toThrow("duplicate dates");
  });

  it("rejects values that are not numbers", () => {
    expect(() => prepareSeries([p("2025-01-01", Number.NaN)])).toThrow("not numbers");
    expect(() => prepareSeries([p("2025-01-01", Number.POSITIVE_INFINITY)])).toThrow(SeriesError);
  });

  it("rejects a series that is mostly invented", () => {
    // 10 known days spread over 100 days: 90% missing
    const pts = [p("2025-01-01", 1)];
    for (let i = 1; i < 10; i++) pts.push(p(new Date(Date.UTC(2025, 0, 1 + i * 11)).toISOString().slice(0, 10), 1));
    expect(() => prepareSeries(pts)).toThrow(/Too many missing days/);
  });

  it("rejects an empty series", () => {
    expect(() => prepareSeries([])).toThrow("empty");
  });
});
