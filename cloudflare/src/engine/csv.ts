import { isRealDate, toIso } from "./dates";

export interface ParsedRow {
  line: number;
  date: string;
  quantity: number;
}

export interface RowError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  rows: ParsedRow[];
  errors: RowError[];
  /** Number of non-empty data rows (header excluded). */
  totalRows: number;
  /** If set, the file is unusable (missing header, missing columns...). */
  fatalError?: string;
}

/**
 * Minimal CSV parser for sales (same rules as the .NET backend).
 * - Required columns (header, case-insensitive): date, quantity. Other columns ignored.
 * - Separator: ';' if present in the header, otherwise ','.
 * - Dates: yyyy-MM-dd, dd/MM/yyyy or d/M/yyyy.
 * - Quantity: dot or comma as decimal; with both, the last symbol is the decimal
 *   ("1.234,56" and "1,234.56" -> 1234.56). A single dot is always a decimal ("1.234" -> 1.234).
 *   Negative quantities are rejected.
 * - With ',' as separator, decimals written with a comma must be quoted ("12,5").
 * - Quoted fields are supported; multi-line fields are NOT.
 */
export function parseSalesCsv(text: string): CsvParseResult {
  const result: CsvParseResult = { rows: [], errors: [], totalRows: 0 };
  let delimiter = ",";
  let headerCount = 0;
  let dateIdx = -1;
  let qtyIdx = -1;
  let headerSeen = false;

  const lines = text.split(/\r\n|\n|\r/);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const line = lines[i] ?? "";
    if (line.trim().length === 0) {
      continue;
    }

    if (!headerSeen) {
      headerSeen = true;
      const headerLine = line.replace(/^\uFEFF+/, "");
      delimiter = headerLine.includes(";") ? ";" : ",";
      const headers = splitLine(headerLine, delimiter);
      headerCount = headers.length;
      headers.forEach((h, idx) => {
        const name = h.trim().toLowerCase();
        if (name === "date" && dateIdx < 0) dateIdx = idx;
        if (name === "quantity" && qtyIdx < 0) qtyIdx = idx;
      });
      if (dateIdx < 0 || qtyIdx < 0) {
        result.fatalError = "The header needs the 'date' and 'quantity' columns.";
        return result;
      }
      continue;
    }

    result.totalRows++;
    const cells = splitLine(line, delimiter);

    // A trailing separator (e.g. "2025-01-01;12;") is not an error.
    while (cells.length > headerCount && cells[cells.length - 1]!.length === 0) {
      cells.pop();
    }

    if (cells.length > headerCount) {
      result.errors.push({
        line: lineNo,
        message: 'Too many columns. If the separator is a comma, decimals written with a comma must be quoted ("12,5").',
      });
      continue;
    }

    if (cells.length <= Math.max(dateIdx, qtyIdx)) {
      result.errors.push({ line: lineNo, message: "Not enough columns." });
      continue;
    }

    const rawDate = cells[dateIdx]!;
    const date = tryParseDate(rawDate);
    if (date === null) {
      result.errors.push({
        line: lineNo,
        message: `Invalid date: '${rawDate.trim()}' (accepted formats: yyyy-MM-dd, dd/MM/yyyy).`,
      });
      continue;
    }

    const parsed = tryParseQuantity(cells[qtyIdx]!);
    if (!parsed.ok) {
      result.errors.push({ line: lineNo, message: parsed.error });
      continue;
    }

    result.rows.push({ line: lineNo, date, quantity: parsed.value });
  }

  if (!headerSeen) {
    result.fatalError = "The file is empty.";
  }
  return result;
}

/** Returns the ISO date, or null if the text is not an accepted date. */
export function tryParseDate(raw: string): string | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return isRealDate(y, mo, d) ? toIso(y, mo, d) : null;
  }
  return null;
}

export type QuantityResult = { ok: true; value: number } | { ok: false; error: string };

export function tryParseQuantity(raw: string): QuantityResult {
  let s = raw.trim().replace(/ /g, "");
  if (s.length === 0) {
    return { ok: false, error: "Missing quantity." };
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
      return { ok: false, error: `Ambiguous quantity: '${raw.trim()}'.` };
    }
    s = s.replace(",", ".");
  }

  const isNumber = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s);
  const value = isNumber ? Number(s) : Number.NaN;
  if (!Number.isFinite(value)) {
    return { ok: false, error: `Invalid quantity: '${raw.trim()}'.` };
  }
  if (value < 0) {
    return { ok: false, error: `Negative quantity not allowed: '${raw.trim()}'.` };
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
