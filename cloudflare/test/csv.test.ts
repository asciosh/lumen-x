import { describe, expect, it } from "vitest";
import { parseSalesCsv, tryParseDate, tryParseQuantity } from "../src/engine/csv";

const qty = (raw: string) => {
  const r = tryParseQuantity(raw);
  return r.ok ? r.value : r.error;
};

describe("quantities", () => {
  it.each([
    ["12", 12],
    ["12.5", 12.5],
    ["12,5", 12.5],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["1.234", 1.234], // a single dot is always a decimal
    ["  7 ", 7],
    ["1 234,5", 1234.5],
    ["0", 0],
    ["1e3", 1000],
  ])("%s -> %s", (raw, expected) => {
    expect(qty(raw)).toBe(expected);
  });

  it("rejects what cannot be understood", () => {
    expect(qty("")).toBe("Missing quantity.");
    expect(qty("   ")).toBe("Missing quantity.");
    expect(qty("1,2,3")).toBe("Ambiguous quantity: '1,2,3'.");
    expect(qty("abc")).toBe("Invalid quantity: 'abc'.");
    expect(qty("12abc")).toBe("Invalid quantity: '12abc'.");
    expect(qty("0x10")).toBe("Invalid quantity: '0x10'.");
    expect(qty("Infinity")).toBe("Invalid quantity: 'Infinity'.");
    expect(qty("-5")).toBe("Negative quantity not allowed: '-5'.");
  });
});

describe("dates", () => {
  it.each([
    ["2025-03-01", "2025-03-01"],
    ["01/03/2025", "2025-03-01"],
    ["1/3/2025", "2025-03-01"],
    [" 2025-12-31 ", "2025-12-31"],
    ["29/02/2024", "2024-02-29"],
  ])("%s is accepted", (raw, iso) => {
    expect(tryParseDate(raw)).toBe(iso);
  });

  it.each(["2025-02-30", "29/02/2025", "2025-13-01", "2025/03/01", "01-03-2025", "2025-3-1", "tomorrow", ""])(
    "%s is rejected",
    (raw) => {
      expect(tryParseDate(raw)).toBeNull();
    },
  );
});

describe("files", () => {
  it("reads a plain ISO file", () => {
    const r = parseSalesCsv("date,quantity\n2025-01-01,10\n2025-01-02,12.5\n");
    expect(r.fatalError).toBeUndefined();
    expect(r.totalRows).toBe(2);
    expect(r.rows).toEqual([
      { line: 2, date: "2025-01-01", quantity: 10 },
      { line: 3, date: "2025-01-02", quantity: 12.5 },
    ]);
    expect(r.errors).toEqual([]);
  });

  it("reads an Italian-style file: semicolon, dd/MM/yyyy, decimal comma", () => {
    const r = parseSalesCsv("data;date;quantity\r\nx;01/01/2025;12,5\r\nx;02/01/2025;7\r\n".replace("data;", "label;"));
    expect(r.rows.map((x) => [x.date, x.quantity])).toEqual([
      ["2025-01-01", 12.5],
      ["2025-01-02", 7],
    ]);
  });

  it("ignores other columns, the case of the header and a BOM", () => {
    const r = parseSalesCsv("\uFEFFStore, DATE ,Quantity,Notes\nA,2025-01-01,3,hello\n");
    expect(r.fatalError).toBeUndefined();
    expect(r.rows).toEqual([{ line: 2, date: "2025-01-01", quantity: 3 }]);
  });

  it("skips blank lines but keeps the real line numbers", () => {
    const r = parseSalesCsv("date,quantity\n\n2025-01-01,1\n   \n2025-01-02,2\n");
    expect(r.rows.map((x) => x.line)).toEqual([3, 5]);
    expect(r.totalRows).toBe(2);
  });

  it("accepts a trailing separator", () => {
    const r = parseSalesCsv("date;quantity\n2025-01-01;12;\n");
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("explains an unquoted decimal comma in a comma-separated file", () => {
    const r = parseSalesCsv("date,quantity\n2025-01-01,12,5\n");
    expect(r.rows).toEqual([]);
    expect(r.errors).toEqual([
      { line: 2, message: 'Too many columns. If the separator is a comma, decimals written with a comma must be quoted ("12,5").' },
    ]);
  });

  it("accepts a quoted decimal comma", () => {
    const r = parseSalesCsv('date,quantity\n2025-01-01,"12,5"\n');
    expect(r.rows[0]?.quantity).toBe(12.5);
  });

  it("reports every bad row and keeps the good ones", () => {
    const r = parseSalesCsv(
      ["date,quantity", "2025-01-01,5", "not-a-date,3", "2025-01-03,", "2025-01-04,-1", "2025-01-05", "2025-01-06,8"].join("\n"),
    );
    expect(r.totalRows).toBe(6);
    expect(r.rows.map((x) => x.line)).toEqual([2, 7]);
    expect(r.errors.map((e) => [e.line, e.message])).toEqual([
      [3, "Invalid date: 'not-a-date' (accepted formats: yyyy-MM-dd, dd/MM/yyyy)."],
      [4, "Missing quantity."],
      [5, "Negative quantity not allowed: '-1'."],
      [6, "Not enough columns."],
    ]);
  });

  it("rejects a file without the needed header", () => {
    expect(parseSalesCsv("day,amount\n2025-01-01,3\n").fatalError).toBe("The header needs the 'date' and 'quantity' columns.");
    expect(parseSalesCsv("date\n2025-01-01\n").fatalError).toBe("The header needs the 'date' and 'quantity' columns.");
  });

  it("rejects an empty file", () => {
    expect(parseSalesCsv("").fatalError).toBe("The file is empty.");
    expect(parseSalesCsv("\n  \n\n").fatalError).toBe("The file is empty.");
  });

  it("handles Windows, Unix and old Mac line endings", () => {
    for (const eol of ["\r\n", "\n", "\r"]) {
      const r = parseSalesCsv(["date,quantity", "2025-01-01,1", "2025-01-02,2"].join(eol));
      expect(r.rows).toHaveLength(2);
    }
  });
});
