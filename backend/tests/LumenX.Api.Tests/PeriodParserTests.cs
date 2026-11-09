using LumenX.Api.Chat;

namespace LumenX.Api.Tests;

public class PeriodParserTests
{
    private static PeriodSpec Last(string question) => PeriodParser.ParseLast(QuestionText.Normalize(question));

    private static int? Future(string question) => PeriodParser.ParseFutureDays(QuestionText.Normalize(question));

    [Theory]
    [InlineData("Quanto ho venduto negli ultimi 30 giorni?", 30)]
    [InlineData("nell'ultimo mese", 30)]
    [InlineData("negli ultimi tre mesi", 90)]
    [InlineData("ultime due settimane", 14)]
    [InlineData("in the last 2 weeks", 14)]
    [InlineData("last month", 30)]
    [InlineData("last week", 7)]
    [InlineData("ultimo anno", 365)]
    [InlineData("l'ultimo giorno", 1)]
    public void Last_periods_are_converted_to_days(string question, int expectedDays)
    {
        var spec = Last(question);

        Assert.Equal(PeriodKind.LastDays, spec.Kind);
        Assert.Equal(expectedDays, spec.Days);
    }

    [Fact]
    public void Plural_unit_without_a_number_is_not_guessed()
    {
        Assert.Equal(PeriodKind.None, Last("gli ultimi giorni del mese").Kind);
    }

    [Fact]
    public void No_period_in_the_question_means_none()
    {
        Assert.Equal(PeriodKind.None, Last("Quanto ho venduto?").Kind);
    }

    [Fact]
    public void A_month_name_is_a_calendar_month()
    {
        var spec = Last("Quanto ho venduto a marzo?");

        Assert.Equal(PeriodKind.CalendarMonth, spec.Kind);
        Assert.Equal(3, spec.Month);
        Assert.Equal(0, spec.Year);
    }

    [Fact]
    public void A_year_next_to_the_month_is_kept()
    {
        var spec = Last("vendite di marzo 2025");

        Assert.Equal(3, spec.Month);
        Assert.Equal(2025, spec.Year);
    }

    [Fact]
    public void English_month_names_work()
    {
        Assert.Equal(2, Last("What did I sell in February?").Month);
    }

    [Fact]
    public void Months_mentioned_lists_each_month_once_in_order()
    {
        var months = PeriodParser.MonthsMentioned(QuestionText.Normalize("aprile rispetto a marzo, aprile"));

        Assert.Equal(new[] { 4, 3 }, months.ToArray());
    }

    [Theory]
    [InlineData("nelle prossime 2 settimane", 14)]
    [InlineData("next week", 7)]
    [InlineData("next 2 weeks", 14)]
    [InlineData("prossimi 10 giorni", 10)]
    [InlineData("il prossimo mese", 30)]
    public void Future_periods_are_converted_to_days(string question, int expectedDays)
    {
        Assert.Equal(expectedDays, Future(question));
    }

    [Theory]
    [InlineData("nelle prossime settimane")]
    [InlineData("Come andranno le vendite?")]
    [InlineData("coming days")]
    public void Future_period_without_a_clear_length_is_null(string question)
    {
        Assert.Null(Future(question));
    }

    // ---- risoluzione in date reali (ultimo giorno di dati: 31 marzo 2026) ----

    private static readonly DateOnly FirstDay = new(2026, 1, 1);
    private static readonly DateOnly LastDay = new(2026, 3, 31);

    [Fact]
    public void Last_days_end_on_the_last_day_of_data()
    {
        var range = PeriodParser.Resolve(new PeriodSpec(PeriodKind.LastDays, 30), FirstDay, LastDay, 90);

        Assert.Equal(new DateOnly(2026, 3, 2), range.Start);
        Assert.Equal(LastDay, range.End);
    }

    [Fact]
    public void No_period_uses_the_default_length()
    {
        var range = PeriodParser.Resolve(new PeriodSpec(PeriodKind.None), FirstDay, LastDay, 7);

        Assert.Equal(new DateOnly(2026, 3, 25), range.Start);
        Assert.Equal(LastDay, range.End);
    }

    [Theory]
    [InlineData(3, 2026, 3, 1, 3, 31)]    // marzo: il mese in corso
    [InlineData(2, 2026, 2, 1, 2, 28)]    // febbraio 2026
    [InlineData(12, 2025, 12, 1, 12, 31)] // dicembre non e' ancora arrivato: quello dell'anno prima
    [InlineData(4, 2025, 4, 1, 4, 30)]    // aprile: ancora nel futuro, quindi aprile 2025
    public void Month_without_year_is_the_latest_one_not_after_the_last_day(
        int month, int year, int sm, int sd, int em, int ed)
    {
        var range = PeriodParser.Resolve(new PeriodSpec(PeriodKind.CalendarMonth, 0, 0, month), FirstDay, LastDay, 30);

        Assert.Equal(new DateOnly(year, sm, sd), range.Start);
        Assert.Equal(new DateOnly(year, em, ed), range.End);
        Assert.Equal(PeriodKind.CalendarMonth, range.Kind);
    }

    [Fact]
    public void Month_with_an_explicit_year_is_used_as_given()
    {
        var range = PeriodParser.Resolve(new PeriodSpec(PeriodKind.CalendarMonth, 0, 2024, 2), FirstDay, LastDay, 30);

        Assert.Equal(new DateOnly(2024, 2, 1), range.Start);
        Assert.Equal(new DateOnly(2024, 2, 29), range.End);   // 2024 e' bisestile
    }
}
