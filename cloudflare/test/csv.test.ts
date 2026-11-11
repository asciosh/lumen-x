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
    // the Cloudflare edition accepts more than the .NET backend
    ["2025/03/01", "2025-03-01"],
    ["2025-3-1", "2025-03-01"],
    ["01-03-2025", "2025-03-01"],
    ["1-3-2025", "2025-03-01"],
    ["01.03.2025", "2025-03-01"],
    ["2025-03-01 00:00:00", "2025-03-01"],
    ["2025-03-01T08:30:15Z", "2025-03-01"],
    ["2025-03-01T08:30:15.250+02:00", "2025-03-01"],
    ["01/03/2025 14:30", "2025-03-01"],
  ])("%s is accepted", (raw, iso) => {
    expect(tryParseDate(raw)).toBe(iso);
  });

  it.each(["2025-02-30", "29/02/2025", "2025-13-01", "03/31/2025", "31/01/25", "2025.03.01", "31 gen 2025", "20250301", "45688", "tomorrow", ""])(
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
      { line: 2, code: "too_many_columns", message: 'Too many columns. If the separator is a comma, decimals written with a comma must be quoted ("12,5").' },
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

describe("files from Excel and from people who do not know what a header is", () => {
  const dates = "2025-01-01;12\n2025-01-02;15\n";

  it.each([
    ["Data;Venduto", "Data", "Venduto"],
    ["data;quantità", "data", "quantità"],
    ["DATA;QUANTITA", "DATA", "QUANTITA"],
    ["Giorno;Pezzi", "Giorno", "Pezzi"],
    ["Data vendita;Q.tà", "Data vendita", "Q.tà"],
    ["data_vendita;qta", "data_vendita", "qta"],
    ["Unità;Giorno", "Giorno", "Unità"], // any order
    ["date;sales", "date", "sales"], // the Kaggle file of the demo
    [" Date ; Units ", "Date", "Units"],
    ["Day;Qty", "Day", "Qty"],
  ])("finds the columns in the header '%s'", (header, dateName, quantityName) => {
    const first = header.startsWith("Unità") ? "12;2025-01-01\n15;2025-01-02\n" : dates;
    const r = parseSalesCsv(`${header}\n${first}`);
    expect(r.fatalError).toBeUndefined();
    expect(r.rows.map((x) => [x.date, x.quantity])).toEqual([["2025-01-01", 12], ["2025-01-02", 15]]);
    expect([r.dateColumn, r.quantityColumn, r.headerless, r.delimiter]).toEqual([dateName, quantityName, false, ";"]);
  });

  it.each(["Data;Importo", "Data;Fatturato", "date;price", "date;amount", "date;revenue", "Data;Totale", "Negozio;Prodotto"])(
    "does not guess: '%s' has no quantity (money is not a quantity), so it asks",
    (header) => {
      const r = parseSalesCsv(`${header}\n${dates}`);
      expect(r.fatalCode).toBe("missing_columns");
      expect(r.fatalError).toBe("The header needs the 'date' and 'quantity' columns.");
      expect(r.columns).toEqual(header.split(";"));
      expect(r.rows).toEqual([]);
    },
  );

  it("prefers the exact English names to the synonyms", () => {
    const r = parseSalesCsv("data;units;quantity;date\n01/01/2025;99;7;2025-01-01\n");
    expect([r.dateColumn, r.quantityColumn]).toEqual(["date", "quantity"]);
    expect(r.rows[0]).toMatchObject({ date: "2025-01-01", quantity: 7 });
  });

  it("takes the first column of each kind when there are several", () => {
    const r = parseSalesCsv("Data;Venduto;Quantità\n2025-01-01;7;99\n");
    expect(r.rows[0]?.quantity).toBe(7);
    expect(r.quantityColumn).toBe("Venduto");
  });

  it("reads what Excel copies: tab-separated, Italian dates and decimals", () => {
    const r = parseSalesCsv("Data\tVenduto\n01/03/2025\t12,5\n02/03/2025\t1.234,5\n");
    expect(r.fatalError).toBeUndefined();
    expect(r.delimiter).toBe("\t");
    expect(r.rows.map((x) => [x.date, x.quantity])).toEqual([["2025-03-01", 12.5], ["2025-03-02", 1234.5]]);
  });

  it("the semicolon wins over a tab, and a comma is only the last choice", () => {
    expect(parseSalesCsv("date;quantity\t\n2025-01-01;1\n").delimiter).toBe(";");
    expect(parseSalesCsv("date\tquantity\n2025-01-01\t1\n").delimiter).toBe("\t");
    expect(parseSalesCsv("date,quantity\n2025-01-01,1\n").delimiter).toBe(",");
  });

  describe("a file with no header line", () => {
    it("is understood when the first row is a date and a number, and that row is not lost", () => {
      const r = parseSalesCsv("2025-01-01;12\n2025-01-02;15\n2025-01-03;9\n");
      expect(r.fatalError).toBeUndefined();
      expect(r.headerless).toBe(true);
      expect([r.dateColumn, r.quantityColumn]).toEqual([null, null]);
      expect(r.rows.map((x) => [x.line, x.date, x.quantity])).toEqual([[1, "2025-01-01", 12], [2, "2025-01-02", 15], [3, "2025-01-03", 9]]);
      expect(r.totalRows).toBe(3);
    });
    it("works with Italian formats too, and keeps the real line numbers when the file starts with blank lines", () => {
      const r = parseSalesCsv("\n\n01/03/2025;12,5\nnot-a-date;3\n03/03/2025;8\n");
      expect(r.headerless).toBe(true);
      expect(r.rows.map((x) => [x.line, x.date, x.quantity])).toEqual([[3, "2025-03-01", 12.5], [5, "2025-03-03", 8]]);
      expect(r.errors.map((e) => [e.line, e.code, e.value])).toEqual([[4, "invalid_date", "not-a-date"]]);
    });
    it("needs a real date and a real number in the first row, otherwise it is a header we cannot read", () => {
      expect(parseSalesCsv("2025-01-01;abc\n2025-01-02;5\n").fatalCode).toBe("missing_columns");
      expect(parseSalesCsv("hello;12\n2025-01-02;5\n").fatalCode).toBe("missing_columns");
      expect(parseSalesCsv("2025-01-01\n2025-01-02\n").fatalCode).toBe("missing_columns");
    });
  });

  describe("when the person chooses the columns", () => {
    const file = "Negozio;Giorno del mese;Cosa\nA;2025-01-01;12\nA;2025-01-02;15\n";
    it("shows the columns of an unreadable header (trimmed and capped), so they can be offered", () => {
      const wide = Array.from({ length: 40 }, (_, i) => ` col${i}${"x".repeat(60)} `).join(";");
      const r = parseSalesCsv(`${wide}\n1\n`);
      expect(r.fatalCode).toBe("missing_columns");
      expect(r.columns).toHaveLength(30);
      expect(r.columns![0]!.length).toBe(40);
      expect(r.columns![0]!.startsWith("col0")).toBe(true);
      expect(parseSalesCsv(file).columns).toEqual(["Negozio", "Giorno del mese", "Cosa"]);
    });
    it("uses the columns they chose", () => {
      const r = parseSalesCsv(file, { dateColumn: 1, quantityColumn: 2 });
      expect(r.fatalError).toBeUndefined();
      expect(r.rows.map((x) => [x.line, x.date, x.quantity])).toEqual([[2, "2025-01-01", 12], [3, "2025-01-02", 15]]);
      expect([r.dateColumn, r.quantityColumn, r.headerless]).toEqual(["Giorno del mese", "Cosa", false]);
    });
    it("treats the first line as data when the chosen date column holds a date there", () => {
      const r = parseSalesCsv("A;2025-01-01;12\nA;2025-01-02;15\n", { dateColumn: 1, quantityColumn: 2 });
      expect(r.headerless).toBe(true);
      expect(r.rows).toHaveLength(2);
    });
    it.each([[-1, 1], [1, 1], [5, 1], [0, 9], [1.5, 2]])("refuses columns that make no sense (%s, %s)", (d, q) => {
      expect(parseSalesCsv(file, { dateColumn: d, quantityColumn: q }).fatalCode).toBe("missing_columns");
    });
    it("needs both columns", () => {
      expect(parseSalesCsv(file, { dateColumn: 1 }).fatalCode).toBe("missing_columns");
      expect(parseSalesCsv(file, { quantityColumn: 2 }).fatalCode).toBe("missing_columns");
    });
  });

  it("gives every row error a code and the written value, so that it can be explained in plain words", () => {
    const r = parseSalesCsv(["date;quantity", "xx;1", "2025-01-02;", "2025-01-03;1,2,3", "2025-01-04;abc", "2025-01-05;-4", "2025-01-06", "2025-01-07;1;2;3"].join("\n"));
    expect(r.errors.map((e) => [e.line, e.code, e.value ?? null])).toEqual([
      [2, "invalid_date", "xx"],
      [3, "missing_quantity", ""],
      [4, "ambiguous_quantity", "1,2,3"],
      [5, "invalid_quantity", "abc"],
      [6, "negative_quantity", "-4"],
      [7, "not_enough_columns", null],
      [8, "too_many_columns", null],
    ]);
  });

  it("an empty file says so, with a code", () => {
    expect(parseSalesCsv("  \n").fatalCode).toBe("empty_file");
  });
});

