import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { answer } from "../src/engine/chat/answer";
import { buildFacts } from "../src/engine/explain";
import { calculateReorder } from "../src/engine/reorder";
import type { SalePoint } from "../src/engine/types";

/**
 * Differential test against the REAL .NET app: docs/data/*.json were exported from the running backend (scripts/export_demo.py)
 * on the Bread series. The answers, the facts of the explanation and the reorder suggestions below were computed by the C# code;
 * the TypeScript port must give the same.
 */
const data = (file: string) => JSON.parse(readFileSync(new URL(`../../docs/data/${file}`, import.meta.url), "utf8"));

const sales: SalePoint[] = data("sales.json");
const run = data("forecast.json");
const ask = data("ask.json") as { productName: string; questions: Record<string, { question: string; intent: string; understood: boolean; answer: string }[]> };
const reorder = data("reorder.json") as { variants: Record<string, number | string | null | string[]>[] };

const zeroDaysPercent = (sales.filter((s) => s.quantity === 0).length * 100) / sales.length;
const context = { productName: ask.productName, sales, forecast: run, zeroDaysPercent };

describe("the TypeScript answers equal the ones of the .NET app", () => {
  for (const language of ["it", "en"]) {
    for (const reference of ask.questions[language]!) {
      it(`${language}: ${reference.question}`, () => {
        const mine = answer(reference.question, language, context);
        expect(mine.intent).toBe(reference.intent);
        expect(mine.understood).toBe(reference.understood);
        expect(mine.text).toBe(reference.answer);
      });
    }
  }
});

describe("the facts equal the ones of the .NET app", () => {
  for (const language of ["it", "en"]) {
    it(`explanation facts (${language} file)`, () => {
      const reference = data(`explanation-${language}.json`).facts as Record<string, number | string | null>;
      const mine = buildFacts(ask.productName, sales, run) as unknown as Record<string, number | string | null>;
      // The .NET JSON names the days with its own casing and dates in ISO: same keys, same values.
      const compared: string[] = [];
      for (const [key, value] of Object.entries(reference)) {
        compared.push(key);
        const got = mine[key];
        if (typeof value === "number") expect(got as number, key).toBeCloseTo(value, 6);
        else expect(got, key).toEqual(value);
      }
      expect(compared.length).toBeGreaterThan(20);
    });
  }
});

describe("the reorder suggestions equal the ones of the .NET app", () => {
  for (const reference of reorder.variants) {
    it(`service level ${reference["serviceLevelPercent"]}%`, () => {
      const outcome = calculateReorder(run, 7, 7, reference["serviceLevelPercent"] as number, null, zeroDaysPercent);
      if (!outcome.ok) throw new Error(outcome.error);
      for (const key of ["periodDays", "zValue", "demandInPeriod", "dailyErrorStdDev", "safetyStock", "orderUpToLevel"] as const) {
        expect(outcome.suggestion[key] as number, key).toBeCloseTo(reference[key] as number, 6);
      }
      expect(outcome.suggestion.warnings).toEqual(reference["warnings"]);
    });
  }
});
