using System.Globalization;

namespace LumenX.Dashboard.Services;

/// <summary>
/// Number and date formatting in Italian or English style, without depending on the system cultures
/// (in containers without ICU, creating "it-IT" may fail).
/// </summary>
public static class Fmt
{
    private static readonly NumberFormatInfo It = new()
    {
        NumberDecimalSeparator = ",",
        NumberGroupSeparator = ".",
        NumberGroupSizes = new[] { 3 }
    };

    private static readonly NumberFormatInfo En = new()
    {
        NumberDecimalSeparator = ".",
        NumberGroupSeparator = ",",
        NumberGroupSizes = new[] { 3 }
    };

    private static bool IsItalian(string language) => language == LanguageState.Italian;

    public static string Num(double value, int decimals, string language) =>
        value.ToString("N" + decimals, IsItalian(language) ? It : En);

    public static string Metric(double? value, string language) =>
        value.HasValue ? Num(value.Value, 2, language) : "–";

    /// <summary>Italian: 31/03/2026. English: 31 Mar 2026.</summary>
    public static string Date(DateOnly d, string language) =>
        d.ToString(IsItalian(language) ? "dd/MM/yyyy" : "d MMM yyyy", CultureInfo.InvariantCulture);

    /// <summary>Short form for the chart axis. Italian: 31/03/26. English: 31 Mar 26.</summary>
    public static string ShortDate(DateOnly d, string language) =>
        d.ToString(IsItalian(language) ? "dd/MM/yy" : "d MMM yy", CultureInfo.InvariantCulture);

    public static string Iso(DateOnly d) => d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    public static string DateTimeUtc(DateTime d, string language) =>
        d.ToUniversalTime().ToString(IsItalian(language) ? "dd/MM/yyyy HH:mm" : "d MMM yyyy HH:mm", CultureInfo.InvariantCulture) + " UTC";
}
