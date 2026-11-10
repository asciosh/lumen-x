import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { examples } from "../src/engine/chat/answer";
import { parseSalesCsv } from "../src/engine/csv";
import { runForecast } from "../src/engine/forecast";

const read = (file: string) => readFileSync(new URL(`../public/${file}`, import.meta.url), "utf8");
const app = read("app.js");
const html = read("index.html");

/** The TEXT dictionary of app.js, read as code (not as text): { en: {...}, it: {...} }. */
function dictionary(): Record<"en" | "it", Record<string, unknown>> {
  const from = app.indexOf("var TEXT = ");
  const to = app.indexOf("\n  };\n", from);
  expect(from, "TEXT dictionary").toBeGreaterThan(-1);
  return new Function(`return ${app.slice(from + "var TEXT = ".length, to + 5)}`)();
}

const keysOf = (language: "en" | "it") => Object.keys(dictionary()[language]).sort();

describe("the dashboard files", () => {
  it("app.js is valid JavaScript", () => {
    expect(() => new Function(app)).not.toThrow();
  });

  it("English and Italian have the same texts", () => {
    const en = keysOf("en");
    const it = keysOf("it");
    expect(en.length).toBeGreaterThan(60);
    expect(it).toEqual(en);
    // A text that is a function in one language (it takes values) must be a function in the other too.
    const { en: a, it: b } = dictionary();
    for (const key of en) expect(typeof b[key], key).toBe(typeof a[key]);
  });

  it("every text used in the code exists", () => {
    const defined = new Set(keysOf("en"));
    const used = [...app.matchAll(/\bt\('([A-Za-z]+)'\)/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(40);
    expect(used.filter((key) => !defined.has(key))).toEqual([]);
  });

  it("the page loads files that exist", () => {
    for (const [, file] of html.matchAll(/(?:href|src)="((?!https?:|#|\/auth)[^"]+)"/g)) {
      expect(existsSync(new URL(`../public/${file}`, import.meta.url)), file).toBe(true);
    }
  });

  it("is not indexed by search engines (it is a private beta)", () => {
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it("never builds the page from user text without escaping", () => {
    // Every place that puts a product name, a SKU or a server message into HTML goes through esc().
    expect(app).not.toMatch(/innerHTML\s*=\s*[^;]*\b(p\.name|view\.product\.name|e\.message)\b(?![^;]*esc\()/);
  });

  it("the example questions of the page are the ones the engine understands", () => {
    const from = app.indexOf("var EXAMPLES = ");
    const to = app.indexOf("\n  };", from);
    const chips = new Function(`return ${app.slice(from + "var EXAMPLES = ".length, to + 4)}`)() as Record<string, string[]>;
    expect(chips["en"]).toEqual([...examples("en")]);
    expect(chips["it"]).toEqual([...examples("it")]);
  });

  it("the privacy notice has the same points in both languages and says what matters", () => {
    const { en, it } = dictionary();
    const [a, b] = [en["privacy"] as string[], it["privacy"] as string[]];
    expect(a.length).toBe(b.length);
    expect(a.length).toBeGreaterThanOrEqual(5);
    const text = a.join(" ");
    for (const piece of ["What is stored", "Where", "No AI service", "Cookies", "Deleting"]) expect(text).toContain(piece);
    expect(text).toContain("could technically read it");
  });

  it("the example CSV is valid and enough for a forecast", () => {
    expect(existsSync(new URL("../public/sample-sales.csv", import.meta.url))).toBe(true);
    expect(app).toContain('href="sample-sales.csv"');
    const parsed = parseSalesCsv(read("sample-sales.csv"));
    expect(parsed.fatalError).toBeUndefined();
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(240);
    const forecast = runForecast(parsed.rows.map((r) => ({ date: r.date, quantity: r.quantity })), 28);
    expect(forecast.forecast).toHaveLength(28);
  });
});
