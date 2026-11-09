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
    public void Unprocessable_gets_a_prefix_in_both_languages()
    {
        var r = ApiResult<string>.Fail(422, "At least 42 days are needed.");

        Assert.False(r.IsSuccess);
        Assert.Equal("Invalid data: At least 42 days are needed.", r.ErrorText);
        Assert.Equal("Invalid data: At least 42 days are needed.", r.For("en"));
        Assert.Equal("Dati non validi: At least 42 days are needed.", r.For("it"));
    }

    [Fact]
    public void Service_unavailable_suggests_what_to_check()
    {
        var r = ApiResult<string>.Fail(503, "The forecasting service is unreachable.");

        Assert.Contains("check that the 'forecasting' service is running", r.For("en"));
        Assert.Contains("controlla che il servizio 'forecasting' sia attivo", r.For("it"));
    }

    [Fact]
    public void Bad_gateway_names_the_forecasting_service()
    {
        var r = ApiResult<string>.Fail(502, "boom");

        Assert.StartsWith("Error from the forecasting service:", r.For("en"));
        Assert.StartsWith("Errore dal servizio di forecasting:", r.For("it"));
    }

    [Fact]
    public void Unreachable_backend_shows_only_the_message_and_it_is_translated()
    {
        var r = ApiResult<string>.Fail(0, "Backend unreachable. Check that it is running and that Backend:BaseUrl is correct.");

        Assert.Equal("Backend unreachable. Check that it is running and that Backend:BaseUrl is correct.", r.For("en"));
        Assert.Equal("Backend non raggiungibile. Controlla che sia avviato e che Backend:BaseUrl sia corretto.", r.For("it"));
    }

    [Fact]
    public void Backend_detail_is_shown_as_it_is_in_any_language()
    {
        var r = ApiResult<string>.Fail(404, "Product 5 not found.");

        Assert.Equal("Product 5 not found.", r.For("en"));
        Assert.Equal("Product 5 not found.", r.For("it"));
    }

    [Fact]
    public void Missing_detail_gets_a_generic_http_message()
    {
        var r = ApiResult<string>.Fail(500, null);

        Assert.Equal("HTTP error 500.", r.For("en"));
        Assert.Equal("Errore HTTP 500.", r.For("it"));
    }

    [Fact]
    public void Missing_detail_with_status_zero_says_the_backend_is_unreachable()
    {
        Assert.Equal("Backend unreachable.", ApiResult<string>.Fail(0, null).For("en"));
        Assert.Equal("Backend non raggiungibile.", ApiResult<string>.Fail(0, null).For("it"));
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
    public void Italian_numbers_use_dot_for_thousands_and_comma_for_decimals(double value, int decimals, string expected)
    {
        Assert.Equal(expected, Fmt.Num(value, decimals, "it"));
    }

    [Theory]
    [InlineData(3360.0, 0, "3,360")]
    [InlineData(1234567.0, 0, "1,234,567")]
    [InlineData(4.29, 1, "4.3")]
    [InlineData(0.5, 2, "0.50")]
    [InlineData(-15.0, 0, "-15")]
    public void English_numbers_use_comma_for_thousands_and_dot_for_decimals(double value, int decimals, string expected)
    {
        Assert.Equal(expected, Fmt.Num(value, decimals, "en"));
    }

    [Fact]
    public void Missing_metric_is_a_dash()
    {
        Assert.Equal("–", Fmt.Metric(null, "it"));
        Assert.Equal("–", Fmt.Metric(null, "en"));
        Assert.Equal("2,50", Fmt.Metric(2.5, "it"));
        Assert.Equal("2.50", Fmt.Metric(2.5, "en"));
    }

    [Fact]
    public void Dates_follow_the_language_style()
    {
        var d = new DateOnly(2026, 5, 16);

        Assert.Equal("16/05/2026", Fmt.Date(d, "it"));
        Assert.Equal("16 May 2026", Fmt.Date(d, "en"));
        Assert.Equal("16/05/26", Fmt.ShortDate(d, "it"));
        Assert.Equal("16 May 26", Fmt.ShortDate(d, "en"));
    }

    [Fact]
    public void Iso_dates_do_not_depend_on_the_language()
    {
        Assert.Equal("2026-05-16", Fmt.Iso(new DateOnly(2026, 5, 16)));
    }

    [Fact]
    public void Timestamps_are_shown_in_utc()
    {
        var utc = new DateTime(2026, 11, 6, 9, 5, 0, DateTimeKind.Utc);

        Assert.Equal("06/11/2026 09:05 UTC", Fmt.DateTimeUtc(utc, "it"));
        Assert.Equal("6 Nov 2026 09:05 UTC", Fmt.DateTimeUtc(utc, "en"));
    }
}
