import { isRealDate, toIso } from "./dates";

export interface ParsedRow {
  line: number;
  date: string;
  quantity: number;
}

/** Why a row was not understood: the dashboard turns the code into a sentence in the language of the person. */
export type RowErrorCode =
  | "too_many_columns"
  | "not_enough_columns"
  | "invalid_date"
  | "missing_quantity"
  | "ambiguous_quantity"
  | "invalid_quantity"
  | "negative_quantity";

export interface RowError {
  line: number;
  /** In English, for whoever uses the API directly. */
  message: string;
  code: RowErrorCode;
  /** What was written in the cell, when that helps to explain the problem. */
  value?: string;
}

export type FatalCode = "empty_file" | "missing_columns";

export interface CsvParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  /** Number of non-empty data rows (header excluded). */
  totalRows: number;
  /** If set, the file is unusable (missing header, missing columns...). */
  fatalError?: string;
  fatalCode?: FatalCode;
  /** When the columns could not be found: the cells of the first line, so that the person can say which is which. */
  columns?: string[];
  /** What was understood: the names of the two columns (null if the file has no header line) and the separator. */
  dateColumn?: string | null;
  quantityColumn?: string | null;
  headerless?: boolean;
  delimiter?: "," | ";" | "\t";
}

export interface ParseOptions {
  /** Which column (0 is the first) holds the date and which the quantity, when the person chose them. */
  dateColumn?: number;
  quantityColumn?: number;
}

const DATE_NAMES = new Set([
  "date", "data", "giorno", "day", "datavendita", "datadivendita", "datadocumento", "dataordine", "datafattura", "datamovimento",
]);
const QUANTITY_NAMES = new Set([
  "quantity", "quantita", "qta", "qty", "qt", "qtavenduta", "quantitavenduta", "venduto", "venduti", "vendute", "vendita", "vendite",
  "unita", "unitavendute", "units", "unitssold", "pezzi", "pz", "sold", "sales", "volume", "volumi",
]);

/** "Quantità" -> "quantita", "Data vendita" -> "datavendita", "Q.tà" -> "qta". */
const normalizeName = (header: string): string =>
  header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const MAX_COLUMNS_LISTED = 30;

/**
 * Parser of the sales files of the Cloudflare edition. It accepts more than the .NET backend, because the people who use it export from
 * Excel and do not know what a header is:
 * - Columns: found by name, in English or Italian ("date", "data", "giorno"... and "quantity", "quantità", "venduto", "pezzi"...; case,
 *   accents, spaces and dots do not matter). Other columns are ignored. With no header line at all (a first row that is already a date and
 *   a number) the first two columns are used. If the names are not understood the result says so and lists the columns, so that the
 *   dashboard can ask which is which and call again with `dateColumn` and `quantityColumn`.
 * - Separator: ';' if the first line has one, otherwise a tab (what Excel copies), otherwise ','.
 * - Dates: yyyy-MM-dd, yyyy/MM/dd, dd/MM/yyyy, dd-MM-yyyy, dd.MM.yyyy (days and months with one digit too), followed or not by a time.
 *   Two-digit years and month-first dates (03/31/2025) are not accepted: they cannot be told apart safely.
 * - Quantity: dot or comma as decimal; with both, the last symbol is the decimal ("1.234,56" and "1,234.56" -> 1234.56). A single dot is
 *   always a decimal ("1.234" -> 1.234). Negative quantities are rejected.
 * - With ',' as separator, decimals written with a comma must be quoted ("12,5").
 * - Quoted fields are supported; multi-line fields are NOT.
 */
export function parseSalesCsv(text: string, options: ParseOptions = {}): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [], totalRows: 0 };
  const lines = text.split(/\r\n|\n|\r/);
  const firstIndex = lines.findIndex((l) => l.trim().length > 0);
  if (firstIndex < 0) {
    result.fatalError = "The file is empty.";
    result.fatalCode = "empty_file";
    return result;
  }

  const headerLine = lines[firstIndex]!.replace(/^\uFEFF+/, "");
  const delimiter: "," | ";" | "\t" = headerLine.includes(";") ? ";" : headerLine.includes("\t") ? "\t" : ",";
  const headers = splitLine(headerLine, delimiter);
  result.delimiter = delimiter;

  let dateIdx = -1;
  let qtyIdx = -1;
  let hasHeader = true;

  if (options.dateColumn !== undefined || options.quantityColumn !== undefined) {
    // The person chose the columns.
    dateIdx = options.dateColumn ?? -1;
    qtyIdx = options.quantityColumn ?? -1;
    const valid = (i: number) => Number.isInteger(i) && i >= 0 && i < headers.length;
    if (!valid(dateIdx) || !valid(qtyIdx) || dateIdx === qtyIdx) {
      return missingColumns(result, headers);
    }
    hasHeader = tryParseDate(headers[dateIdx]!) === null;
  } else {
    // The exact English names win over the synonyms ("date" and "quantity"), then the first synonym found.
    const names = headers.map(normalizeName);
    dateIdx = names.indexOf("date") >= 0 ? names.indexOf("date") : names.findIndex((n) => DATE_NAMES.has(n));
    qtyIdx = names.indexOf("quantity") >= 0 ? names.indexOf("quantity") : names.findIndex((n, i) => i !== dateIdx && QUANTITY_NAMES.has(n));
    if (dateIdx < 0 || qtyIdx < 0) {
      // No header line? Then the first row is already data: a date and a number.
      if (headers.length >= 2 && tryParseDate(headers[0]!) !== null && tryParseQuantity(headers[1]!).ok) {
        dateIdx = 0;
        qtyIdx = 1;
        hasHeader = false;
      } else {
        return missingColumns(result, headers);
      }
    }
  }

  result.headerless = !hasHeader;
  result.dateColumn = hasHeader ? headers[dateIdx]!.trim() : null;
  result.quantityColumn = hasHeader ? headers[qtyIdx]!.trim() : null;
  const headerCount = headers.length;

  for (let i = hasHeader ? firstIndex + 1 : firstIndex; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      continue;
    }
    result.totalRows++;
    const cells = splitLine(i === firstIndex ? headerLine : line, delimiter);
    // A trailing separator (e.g. "2025-01-01;12;") is not an error.
    while (cells.length > headerCount && cells[cells.length - 1]!.length === 0) {
      cells.pop();
    }
    if (cells.length > headerCount) {
      result.errors.push({
        line: lineNo,
        code: "too_many_columns",
        message: 'Too many columns. If the separator is a comma, decimals written with a comma must be quoted ("12,5").',
      });
      continue;
    }
    if (cells.length <= Math.max(dateIdx, qtyIdx)) {
      result.errors.push({ line: lineNo, code: "not_enough_columns", message: "Not enough columns." });
      continue;
    }
    const rawDate = cells[dateIdx]!;
    const date = tryParseDate(rawDate);
    if (date === null) {
      result.errors.push({
        line: lineNo,
        code: "invalid_date",
        value: rawDate.trim(),
        message: `Invalid date: '${rawDate.trim()}' (accepted formats: yyyy-MM-dd, dd/MM/yyyy).`,
      });
      continue;
    }
    const parsed = tryParseQuantity(cells[qtyIdx]!);
    if (!parsed.ok) {
      result.errors.push({ line: lineNo, code: parsed.code, value: cells[qtyIdx]!.trim(), message: parsed.error });
      continue;
    }
    result.rows.push({ line: lineNo, date, quantity: parsed.value });
  }
  return result;
}

function missingColumns(result: CsvParseResult, headers: string[]): CsvParseResult {
  result.fatalError = "The header needs the 'date' and 'quantity' columns.";
  result.fatalCode = "missing_columns";
  result.columns = headers.slice(0, MAX_COLUMNS_LISTED).map((h) => h.trim().slice(0, 40));
  return result;
}

/** Returns the ISO date, or null if the text is not an accepted date. */
export function tryParseDate(raw: string): string | null {
  // A time after the date ("2025-01-31 00:00:00", "31/01/2025 14:30", "2025-01-31T00:00:00Z") is ignored.
  const s = raw.trim().replace(/[ T]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:Z|[+-]\d{2}:?\d{2})?$/i, "").trim();

  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }
  return null;
}

export type QuantityResult =
  | { ok: true; value: number }
  | { ok: false; error: string; code: "missing_quantity" | "ambiguous_quantity" | "invalid_quantity" | "negative_quantity" };

export function tryParseQuantity(raw: string): QuantityResult {
  let s = raw.trim().replace(/ /g, "");
  if (s.length === 0) {
    return { ok: false, error: "Missing quantity.", code: "missing_quantity" };
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", "."); // 1.234,56
    } else {
      s = s.replace(/,/g, ""); // 1,234.56
    }
  } else if (lastComma >= 0) {
    if (s.indexOf(",") !== lastComma) {
      return { ok: false, error: `Ambiguous quantity: '${raw.trim()}'.`, code: "ambiguous_quantity" };
    }
    s = s.replace(",", ".");
  }
  const isNumber = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
  const value = isNumber ? Number(s) : Number.NaN;
  if (!Number.isFinite(value)) {
    return { ok: false, error: `Invalid quantity: '${raw.trim()}'.`, code: "invalid_quantity" };
  }
  if (value < 0) {
    return { ok: false, error: `Negative quantity not allowed: '${raw.trim()}'.`, code: "negative_quantity" };
  }
  return { ok: true, value };
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  cells.push(current);
  return cells;
}
