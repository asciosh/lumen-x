using System.Globalization;

namespace LumenX.Api.Chat;

/// <summary>
/// Numbers, dates and names in the language of the answer. Separators are written by hand: they do not depend on the
/// installed cultures (they may be missing in containers).
/// </summary>
public static class NumberText
{
    private static readonly NumberFormatInfo ItNumbers = new()
    {
        NumberDecimalSeparator = ",",
        NumberGroupSeparator = ".",
        NumberGroupSizes = new[] { 3 }
    };

    private static readonly NumberFormatInfo EnNumbers = new()
    {
        NumberDecimalSeparator = ".",
        NumberGroupSeparator = ",",
        NumberGroupSizes = new[] { 3 }
    };

    // Indexed by (int)DayOfWeek: Sunday = 0.
    private static readonly string[] ItWeekdays = { "domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato" };
    private static readonly string[] EnWeekdays = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };

    private static readonly string[] ItMonths =
    {
        "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
        "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"
    };

    private static readonly string[] EnMonths =
    {
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    };

    /// <summary>Quantity: no decimals from 100 up, one below.</summary>
    public static string Qty(double value, bool it)
    {
        var decimals = Math.Abs(value) >= 100 ? 0 : 1;
        return value.ToString("N" + decimals, it ? ItNumbers : EnNumbers);
    }

    /// <summary>Percentage without sign: the direction ("more", "less") is stated by the sentence.</summary>
    public static string Pct(double value, bool it)
    {
        var decimals = Math.Abs(value) >= 10 ? 0 : 1;
        return Math.Abs(value).ToString("N" + decimals, it ? ItNumbers : EnNumbers);
    }

    public static string Date(DateOnly date, bool it) =>
        date.ToString(it ? "dd/MM/yyyy" : "d MMM yyyy", CultureInfo.InvariantCulture);

    public static string Days(int count, bool it) =>
        it ? (count == 1 ? "1 giorno" : $"{count} giorni") : (count == 1 ? "1 day" : $"{count} days");

    public static string Weekday(DayOfWeek day, bool it) => (it ? ItWeekdays : EnWeekdays)[(int)day];

    /// <summary>Month from 1 to 12.</summary>
    public static string Month(int month, bool it) => (it ? ItMonths : EnMonths)[month - 1];
}
