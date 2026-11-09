using System.Globalization;
using System.Text;

namespace LumenX.Api.Sales;

public sealed record ParsedRow(int Line, DateOnly Date, double Quantity);
public sealed record RowError(int Line, string Message);

public sealed class CsvParseResult
{
    public List<ParsedRow> Rows { get; } = new();
    public List<RowError> Errors { get; } = new();

    /// <summary>Number of non-empty data rows (header excluded).</summary>
    public int TotalRows { get; set; }

    /// <summary>If set, the file is unusable (missing header, missing columns...).</summary>
    public string? FatalError { get; set; }
}

/// <summary>
/// Minimal CSV parser for sales.
/// - Required columns (header, case-insensitive): date, quantity. Other columns ignored.
/// - Separator: ';' if present in the header, otherwise ','.
/// - Dates: yyyy-MM-dd or dd/MM/yyyy.
/// - Quantity: dot or comma as decimal; with both, the last symbol is the decimal
///   ("1.234,56" and "1,234.56" -> 1234.56). A single dot is always a decimal ("1.234" -> 1.234).
///   Negative quantities are rejected.
/// - With ',' as separator, decimals written with a comma must be quoted ("12,5").
/// - Quoted fields are supported; multi-line fields are NOT.
/// </summary>
public static class SalesCsvParser
{
    private static readonly string[] DateFormats = { "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy" };

    public static CsvParseResult Parse(TextReader reader)
    {
        var result = new CsvParseResult();
        var delimiter = ',';
        var headerCount = 0;
        var dateIdx = -1;
        var qtyIdx = -1;
        var headerSeen = false;
        var lineNo = 0;

        string? line;
        while ((line = reader.ReadLine()) != null)
        {
            lineNo++;
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            if (!headerSeen)
            {
                headerSeen = true;
                var headerLine = line.TrimStart('\uFEFF');
                delimiter = headerLine.Contains(';') ? ';' : ',';
                var headers = SplitLine(headerLine, delimiter);
                headerCount = headers.Count;
                for (var i = 0; i < headers.Count; i++)
                {
                    var name = headers[i].Trim().ToLowerInvariant();
                    if (name == "date" && dateIdx < 0) dateIdx = i;
                    if (name == "quantity" && qtyIdx < 0) qtyIdx = i;
                }

                if (dateIdx < 0 || qtyIdx < 0)
                {
                    result.FatalError = "The header needs the 'date' and 'quantity' columns.";
                    return result;
                }
                continue;
            }

            result.TotalRows++;
            var cells = SplitLine(line, delimiter);

            // A trailing separator (e.g. "2025-01-01;12;") is not an error.
            while (cells.Count > headerCount && cells[cells.Count - 1].Length == 0)
            {
                cells.RemoveAt(cells.Count - 1);
            }

            if (cells.Count > headerCount)
            {
                result.Errors.Add(new RowError(lineNo,
                    "Too many columns. If the separator is a comma, decimals written with a comma must be quoted (\"12,5\")."));
                continue;
            }

            if (cells.Count <= Math.Max(dateIdx, qtyIdx))
            {
                result.Errors.Add(new RowError(lineNo, "Colonne insufficienti."));
                continue;
            }

            if (!TryParseDate(cells[dateIdx], out var date))
            {
                result.Errors.Add(new RowError(lineNo,
                    $"Invalid date: '{cells[dateIdx].Trim()}' (accepted formats: yyyy-MM-dd, dd/MM/yyyy)."));
                continue;
            }

            if (!TryParseQuantity(cells[qtyIdx], out var quantity, out var quantityError))
            {
                result.Errors.Add(new RowError(lineNo, quantityError));
                continue;
            }

            result.Rows.Add(new ParsedRow(lineNo, date, quantity));
        }

        if (!headerSeen)
        {
            result.FatalError = "The file is empty.";
        }

        return result;
    }

    public static bool TryParseDate(string raw, out DateOnly date)
    {
        return DateOnly.TryParseExact(raw.Trim(), DateFormats, CultureInfo.InvariantCulture, DateTimeStyles.None, out date);
    }

    public static bool TryParseQuantity(string raw, out double value, out string error)
    {
        value = 0;
        error = string.Empty;

        var s = raw.Trim().Replace(" ", string.Empty);
        if (s.Length == 0)
        {
            error = "Missing quantity.";
            return false;
        }

        var lastComma = s.LastIndexOf(',');
        var lastDot = s.LastIndexOf('.');

        if (lastComma >= 0 && lastDot >= 0)
        {
            if (lastComma > lastDot)
            {
                // 1.234,56
                s = s.Replace(".", string.Empty).Replace(',', '.');
            }
            else
            {
                // 1,234.56
                s = s.Replace(",", string.Empty);
            }
        }
        else if (lastComma >= 0)
        {
            if (s.IndexOf(',') != lastComma)
            {
                error = $"Ambiguous quantity: '{raw.Trim()}'.";
                return false;
            }
            s = s.Replace(',', '.');
        }

        if (!double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out value) || !double.IsFinite(value))
        {
            error = $"Invalid quantity: '{raw.Trim()}'.";
            value = 0;
            return false;
        }

        if (value < 0)
        {
            error = $"Negative quantity not allowed: '{raw.Trim()}'.";
            value = 0;
            return false;
        }

        return true;
    }

    private static List<string> SplitLine(string line, char delimiter)
    {
        var cells = new List<string>();
        var sb = new StringBuilder();
        var inQuotes = false;

        for (var i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (inQuotes)
            {
                if (c == '"')
                {
                    if (i + 1 < line.Length && line[i + 1] == '"')
                    {
                        sb.Append('"');
                        i++;
                    }
                    else
                    {
                        inQuotes = false;
                    }
                }
                else
                {
                    sb.Append(c);
                }
            }
            else if (c == '"')
            {
                inQuotes = true;
            }
            else if (c == delimiter)
            {
                cells.Add(sb.ToString());
                sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }

        cells.Add(sb.ToString());
        return cells;
    }
}
