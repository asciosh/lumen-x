using System.Globalization;

namespace LumenX.Dashboard.Services;

/// <summary>
/// Formattazione in stile italiano senza dipendere dalle culture di sistema
/// (nei container senza ICU creare "it-IT" puo' fallire).
/// </summary>
public static class Fmt
{
    private static readonly NumberFormatInfo It = new()
    {
        NumberDecimalSeparator = ",",
        NumberGroupSeparator = ".",
        NumberGroupSizes = new[] { 3 }
    };

    public static string Num(double value, int decimals = 1) => value.ToString("N" + decimals, It);

    public static string Metric(double? value) => value.HasValue ? Num(value.Value, 2) : "–";

    public static string Date(DateOnly d) => d.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    public static string ShortDate(DateOnly d) => d.ToString("dd/MM/yy", CultureInfo.InvariantCulture);

    public static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static string DateTimeUtc(DateTime d) =>
        d.ToUniversalTime().ToString("dd/MM/yyyy HH:mm", CultureInfo.InvariantCulture) + " UTC";
}
