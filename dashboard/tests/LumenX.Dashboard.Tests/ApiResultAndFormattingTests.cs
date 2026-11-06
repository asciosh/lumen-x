using LumenX.Dashboard.Services;

namespace LumenX.Dashboard.Tests;

public class ApiResultTests
{
    [Fact]
    public void Ok_carries_the_value()
    {
        var r = ApiResult<string>.Ok("x");

        Assert.True(r.IsSuccess);
        Assert.Equal("x", r.Value);
        Assert.Null(r.Error);
    }

    [Fact]
    public void Unprocessable_gets_a_prefix()
    {
        var r = ApiResult<string>.Fail(422, "Servono 42 giorni.");

        Assert.False(r.IsSuccess);
        Assert.Equal("Dati non validi: Servono 42 giorni.", r.ErrorText);
    }

    [Fact]
    public void Service_unavailable_suggests_what_to_check()
    {
        var r = ApiResult<string>.Fail(503, "Servizio non raggiungibile");

        Assert.Contains("servizio 'forecasting' sia attivo", r.ErrorText);
    }

    [Fact]
    public void Bad_gateway_names_the_forecasting_service()
    {
        Assert.StartsWith("Errore dal servizio di forecasting:", ApiResult<string>.Fail(502, "boom").ErrorText);
    }

    [Fact]
    public void Unreachable_backend_shows_only_the_message()
    {
        Assert.Equal("Backend non raggiungibile.", ApiResult<string>.Fail(0, "Backend non raggiungibile.").ErrorText);
    }

    [Fact]
    public void Other_errors_show_the_backend_message()
    {
        Assert.Equal("Prodotto 5 non trovato.", ApiResult<string>.Fail(404, "Prodotto 5 non trovato.").ErrorText);
    }
}

public class FmtTests
{
    [Theory]
    [InlineData(3360.0, 0, "3.360")]
    [InlineData(1234567.0, 0, "1.234.567")]
    [InlineData(4.29, 1, "4,3")]
    [InlineData(0.5, 2, "0,50")]
    [InlineData(-15.0, 0, "-15")]
    public void Numbers_use_italian_separators(double value, int decimals, string expected)
    {
        Assert.Equal(expected, Fmt.Num(value, decimals));
    }

    [Fact]
    public void Missing_metric_is_a_dash()
    {
        Assert.Equal("–", Fmt.Metric(null));
        Assert.Equal("2,50", Fmt.Metric(2.5));
    }

    [Fact]
    public void Dates_are_formatted_for_people_and_for_urls()
    {
        var d = new DateOnly(2026, 5, 16);

        Assert.Equal("16/05/2026", Fmt.Date(d));
        Assert.Equal("16/05/26", Fmt.ShortDate(d));
        Assert.Equal("2026-05-16", Fmt.Iso(d));
    }

    [Fact]
    public void Timestamps_are_shown_in_utc()
    {
        var local = new DateTime(2026, 11, 6, 9, 5, 0, DateTimeKind.Utc);

        Assert.Equal("06/11/2026 09:05 UTC", Fmt.DateTimeUtc(local));
    }
}
