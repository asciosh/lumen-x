using Bunit;
using LumenX.Dashboard.Components.Pages;
using LumenX.Dashboard.Services;
using LumenX.Dashboard.Tests.TestSupport;

namespace LumenX.Dashboard.Tests;

public class ProductDetailPageTests : DashboardTestBase
{
    private IRenderedComponent<ProductDetail> RenderDetail() =>
        Render<ProductDetail>(p => p.Add(c => c.Id, 5));

    private IRenderedComponent<ProductDetail> RenderWithForecast()
    {
        Api.LatestForecast = ApiResult<ForecastRunDto>.Ok(Samples.Forecast());
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("svg.chart")));
        return cut;
    }

    // ------------------------------------------------------------------ product and sales

    [Fact]
    public void Shows_the_product_with_its_sku_and_a_summary_of_the_sales()
    {
        var cut = RenderDetail();

        cut.WaitForAssertion(() => Assert.Equal("Pane", cut.Find("h1").TextContent));
        Assert.Contains("SKU: P-1", cut.Markup);
        Assert.Contains("dal 01/01/2025 al 01/03/2025", cut.Markup);   // 60 days starting on 1 January
    }

    [Fact]
    public void Unknown_product_shows_the_error()
    {
        Api.Product = ApiResult<ProductDto>.Fail(404, "Prodotto 5 non trovato.");

        var cut = RenderDetail();

        Assert.Contains("Prodotto 5 non trovato.", cut.Find(".alert-error").TextContent);
        Assert.Empty(cut.FindAll("h1"));
    }

    [Fact]
    public void Sales_filter_sends_the_chosen_dates()
    {
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        FieldInLabel(cut, "Da").Change("2025-02-01");
        FieldInLabel(cut, "A").Change("2025-02-20");
        ButtonByText(cut, "Applica").Click();

        cut.WaitForAssertion(() =>
            Assert.Equal(((DateOnly?)new DateOnly(2025, 2, 1), (DateOnly?)new DateOnly(2025, 2, 20)), Api.SalesCalls.Last()));
    }

    [Fact]
    public void Reversed_dates_are_rejected_without_calling_the_backend()
    {
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));
        var callsBefore = Api.SalesCalls.Count;

        FieldInLabel(cut, "Da").Change("2025-03-01");
        FieldInLabel(cut, "A").Change("2025-02-01");
        ButtonByText(cut, "Applica").Click();

        Assert.Contains("successivo", cut.Find(".alert-error").TextContent);
        Assert.Equal(callsBefore, Api.SalesCalls.Count);
    }

    // ------------------------------------------------------------------ forecast

    [Fact]
    public void Without_a_forecast_it_says_so_and_hides_explanation_and_reorder()
    {
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        Assert.Contains("Nessun forecast salvato per questo prodotto.", cut.Markup);
        Assert.DoesNotContain("Riordino", cut.Markup);
        Assert.Empty(Api.ExplanationCalls);
    }

    [Fact]
    public void With_a_forecast_it_shows_method_backtest_points_and_chart()
    {
        var cut = RenderWithForecast();

        Assert.Contains(cut.FindAll("strong"), s => s.TextContent == "blend");
        var headings = cut.FindAll("h3").Select(h => h.TextContent).ToList();
        Assert.Contains("Quanto è affidabile", headings);
        Assert.Contains("Giorno per giorno", headings);
        Assert.Contains("10,50", cut.Markup);                       // MAE del naive
        Assert.Equal(28, cut.FindAll("div.scroll tbody tr").Count);   // one point per day
        Assert.Single(cut.FindAll("svg.chart"));
    }

    [Fact]
    public void Default_forecast_request_is_28_days_with_auto()
    {
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        ButtonByText(cut, "Calcola forecast").Click();

        cut.WaitForAssertion(() => Assert.Equal((5, (int?)28, (string?)"auto"), Api.ForecastCalls.Single()));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("svg.chart")));
    }

    [Fact]
    public void Horizon_out_of_range_is_rejected_without_calling_the_backend()
    {
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        FieldInLabel(cut, "Orizzonte").Change("120");
        ButtonByText(cut, "Calcola forecast").Click();

        Assert.Contains("compreso tra 1 e 90", cut.Find(".alert-error").TextContent);
        Assert.Empty(Api.ForecastCalls);
    }

    [Fact]
    public void Unprocessable_forecast_shows_the_backend_message()
    {
        Api.CreateForecastResult = ApiResult<ForecastRunDto>.Fail(422, "Servono almeno 42 giorni di vendite.");
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        ButtonByText(cut, "Calcola forecast").Click();

        cut.WaitForAssertion(() =>
            Assert.Contains("Dati non validi: Servono almeno 42 giorni", cut.Find(".alert-error").TextContent));
    }

    [Fact]
    public void Service_unavailable_tells_the_user_what_to_check()
    {
        Api.CreateForecastResult = ApiResult<ForecastRunDto>.Fail(503, "Il servizio di forecasting non risponde");
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        ButtonByText(cut, "Calcola forecast").Click();

        cut.WaitForAssertion(() =>
            Assert.Contains("controlla che il servizio 'forecasting' sia attivo", cut.Find(".alert-error").TextContent));
    }

    // ------------------------------------------------------------------ explanation

    [Fact]
    public void Explanation_is_loaded_in_italian_from_the_template_by_default()
    {
        var cut = RenderWithForecast();

        Assert.Equal(("it", false), Api.ExplanationCalls.Single());
        Assert.Equal("Testo di prova (it)", cut.Find(".explanation").TextContent);
        Assert.Contains("modello a regole", cut.Markup);
    }

    [Fact]
    public void Changing_the_language_requests_it_without_using_the_ai()
    {
        var cut = RenderWithForecast();

        FieldInLabel(cut, "Lingua").Change("en");

        cut.WaitForAssertion(() => Assert.Equal(("en", false), Api.ExplanationCalls.Last()));
        cut.WaitForAssertion(() => Assert.Equal("Testo di prova (en)", cut.Find(".explanation").TextContent));
    }

    [Fact]
    public void Rewrite_with_gemini_requests_the_ai_and_shows_its_source()
    {
        var cut = RenderWithForecast();

        ButtonByText(cut, "Riscrivi con Gemini").Click();

        cut.WaitForAssertion(() => Assert.Equal(("it", true), Api.ExplanationCalls.Last()));
        cut.WaitForAssertion(() => Assert.Contains("Gemini (riscritta", cut.Markup));
    }

    [Theory]
    [InlineData("ai_not_configured", "manca GEMINI_API_KEY")]
    [InlineData("ai_unavailable", "Gemini non ha risposto")]
    [InlineData("ai_rejected", "numeri che non sono nei fatti")]
    public void Fallback_notes_are_explained_to_the_user(string note, string expectedText)
    {
        Api.ExplanationFactory = (lang, useAi) => ApiResult<ExplanationDto>.Ok(
            new ExplanationDto(1, lang, "Testo a regole", "template", useAi ? note : null));
        var cut = RenderWithForecast();

        ButtonByText(cut, "Riscrivi con Gemini").Click();

        cut.WaitForAssertion(() => Assert.Contains(expectedText, cut.Markup));
        Assert.Contains("versione a regole", cut.Markup);
    }

    [Fact]
    public void Explanation_error_is_shown_without_breaking_the_page()
    {
        Api.ExplanationFactory = (_, _) => ApiResult<ExplanationDto>.Fail(404, "Nessun forecast salvato.");

        var cut = RenderWithForecast();

        Assert.Contains("Nessun forecast salvato.", cut.Find(".alert-error").TextContent);
        Assert.Single(cut.FindAll("svg.chart"));
    }

    // ------------------------------------------------------------------ reorder

    [Fact]
    public void Reorder_section_appears_only_with_a_forecast()
    {
        var cut = RenderWithForecast();

        Assert.Contains("Riordino", cut.FindAll("h3").Select(h => h.TextContent));
        Assert.DoesNotContain(cut.FindAll("tr"), r => r.TextContent.Contains("Periodo da coprire"));
    }

    [Fact]
    public void Reorder_uses_the_default_parameters_and_shows_the_result()
    {
        var cut = RenderWithForecast();

        ButtonByText(cut, "Calcola riordino").Click();

        cut.WaitForAssertion(() => Assert.Equal("14 giorni", RowValue(cut, "Periodo da coprire")));
        Assert.Equal(new ReorderCall(5, 7, 7, 95, null), Api.ReorderCalls.Single());
        Assert.Equal("1.400", RowValue(cut, "Domanda prevista nel periodo"));
        Assert.Equal("123", RowValue(cut, "Scorta di sicurezza"));
        Assert.Equal("1.523", RowValue(cut, "Livello massimo"));
        Assert.DoesNotContain("Ordine suggerito", cut.Markup);
    }

    [Fact]
    public void Reorder_forwards_the_chosen_parameters()
    {
        var cut = RenderWithForecast();

        FieldInLabel(cut, "Giorni di consegna").Change("10");
        FieldInLabel(cut, "Giorni tra un ordine").Change("3");
        FieldInLabel(cut, "Livello di servizio").Change("99");
        ButtonByText(cut, "Calcola riordino").Click();

        cut.WaitForAssertion(() => Assert.Equal(new ReorderCall(5, 10, 3, 99, null), Api.ReorderCalls.Single()));
        cut.WaitForAssertion(() => Assert.Equal("13 giorni", RowValue(cut, "Periodo da coprire")));
    }

    [Fact]
    public void Reorder_with_stock_on_hand_shows_the_suggested_order_and_accepts_a_comma()
    {
        var cut = RenderWithForecast();

        FieldInLabel(cut, "Scorta attuale").Change("300,5");
        ButtonByText(cut, "Calcola riordino").Click();

        cut.WaitForAssertion(() => Assert.Equal("1.223", RowValue(cut, "Ordine suggerito")));   // 1523,09 - 300,5 per eccesso
        Assert.Equal(300.5, Api.ReorderCalls.Single().OnHand);
    }

    [Fact]
    public void Reorder_with_a_stock_that_is_not_a_number_is_rejected_locally()
    {
        var cut = RenderWithForecast();

        FieldInLabel(cut, "Scorta attuale").Change("abc");
        ButtonByText(cut, "Calcola riordino").Click();

        Assert.Contains("deve essere un numero", cut.Find(".alert-error").TextContent);
        Assert.Empty(Api.ReorderCalls);
    }

    [Fact]
    public void Reorder_error_from_the_backend_is_shown()
    {
        Api.ReorderFactory = _ => ApiResult<ReorderSuggestionDto>.Fail(
            422, "Il periodo da coprire (40 giorni) supera l'orizzonte del forecast (28 giorni).");
        var cut = RenderWithForecast();

        ButtonByText(cut, "Calcola riordino").Click();

        cut.WaitForAssertion(() =>
        {
            var text = cut.Find(".alert-error").TextContent;
            Assert.Contains("Dati non validi:", text);
            Assert.Contains("supera l'orizzonte", text);
        });
    }

    [Fact]
    public void Reorder_warning_for_intermittent_series_is_shown()
    {
        Api.ReorderFactory = call => ApiResult<ReorderSuggestionDto>.Ok(new ReorderSuggestionDto(
            1, "blend", call.LeadTimeDays, call.ReviewDays, 14, call.ServiceLevel, 1.6449,
            1400, 20, 123.09, 1523.09, null, null, new List<string> { "intermittent" }));
        var cut = RenderWithForecast();

        ButtonByText(cut, "Calcola riordino").Click();

        cut.WaitForAssertion(() => Assert.Contains("Molti giorni a zero nello storico", cut.Markup));
    }

    [Fact]
    public void A_new_forecast_clears_the_previous_reorder_result()
    {
        var cut = RenderWithForecast();
        ButtonByText(cut, "Calcola riordino").Click();
        cut.WaitForAssertion(() => Assert.Contains("Periodo da coprire", cut.Markup));

        ButtonByText(cut, "Calcola forecast").Click();

        cut.WaitForAssertion(() => Assert.DoesNotContain("Periodo da coprire", cut.Markup));
    }

    // ------------------------------------------------------------------ look and structure

    [Fact]
    public void Page_opens_with_a_plain_sentence_about_the_next_days()
    {
        var cut = RenderWithForecast();

        var lead = cut.Find("p.lead").TextContent;

        Assert.Contains("Prossimi 28 giorni", lead);
        Assert.Contains("unità", lead);
        // sum of the Samples.Forecast() predictions: 28 days, 120 + (i % 7) * 10
        var expectedTotal = Samples.Forecast().Forecast.Sum(p => p.Yhat);
        Assert.Contains(Fmt.Num(expectedTotal, 0, "it"), lead);
    }

    [Fact]
    public void Forecast_comes_before_sales_and_import_in_the_page()
    {
        var cut = RenderWithForecast();

        var headings = cut.FindAll("h2").Select(h => h.TextContent).ToList();

        Assert.Equal(new[] { "Previsione", "Chiedi ai tuoi dati", "Vendite", "Importa vendite da CSV" }, headings.ToArray());
    }

    [Fact]
    public void Facts_list_the_method_with_a_hint_for_the_blend()
    {
        var cut = RenderWithForecast();

        var method = cut.FindAll("dl.facts strong").First(s => s.TextContent == "blend");

        Assert.Equal("Media di ETS e LightGBM", method.GetAttribute("title"));
        Assert.Contains("Orizzonte", cut.Find("dl.facts").TextContent);
    }

    [Fact]
    public void Sales_and_import_start_closed_when_there_is_data_and_open_when_there_is_none()
    {
        var withData = RenderWithForecast();
        Assert.All(withData.FindAll("details.fold"), d => Assert.False(d.HasAttribute("open")));

        Api.Sales = ApiResult<List<SalePointDto>>.Ok(new List<SalePointDto>());
        var withoutData = RenderDetail();
        withoutData.WaitForAssertion(() => Assert.NotEmpty(withoutData.FindAll("h1")));

        Assert.All(withoutData.FindAll("details.fold"), d => Assert.True(d.HasAttribute("open")));
    }

    [Fact]
    public void Import_section_stays_open_after_the_first_import_adds_sales()
    {
        Api.Sales = ApiResult<List<SalePointDto>>.Ok(new List<SalePointDto>());
        var cut = RenderDetail();
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        Api.Sales = ApiResult<List<SalePointDto>>.Ok(Samples.Sales(60));
        FieldInLabel(cut, "Da").Change("2025-01-01");
        ButtonByText(cut, "Applica").Click();

        cut.WaitForAssertion(() => Assert.Contains("giorni, dal 01/01/2025", cut.Markup));
        Assert.All(cut.FindAll("details.fold"), d => Assert.True(d.HasAttribute("open")));
    }
}
