using System.Text.RegularExpressions;
using Bunit;
using LumenX.Dashboard.Components;
using LumenX.Dashboard.Components.Pages;
using LumenX.Dashboard.Services;
using LumenX.Dashboard.Tests.TestSupport;

namespace LumenX.Dashboard.Tests;

public class LocDictionaryTests
{
    [Fact]
    public void Italian_text_is_used_only_when_the_language_is_italian()
    {
        Assert.Equal("Prodotti", Loc.T("Products", "it"));
        Assert.Equal("Products", Loc.T("Products", "en"));
    }

    [Fact]
    public void A_text_without_a_translation_falls_back_to_english()
    {
        Assert.Equal("Some text nobody translated", Loc.T("Some text nobody translated", "it"));
    }

    [Fact]
    public void Placeholders_are_filled_in_both_languages()
    {
        Assert.Equal("14 giorni", Loc.T("{0} days", "it", 14));
        Assert.Equal("14 days", Loc.T("{0} days", "en", 14));
    }

    [Fact]
    public void Text_without_arguments_is_not_treated_as_a_format_string()
    {
        Assert.Equal("Braces {0} stay as they are", Loc.T("Braces {0} stay as they are", "en"));
    }

    [Fact]
    public void Every_translation_keeps_the_same_placeholders_as_the_english_text()
    {
        var placeholder = new Regex(@"\{\d+\}");
        foreach (var (english, italian) in Loc.ItalianTexts)
        {
            var expected = placeholder.Matches(english).Select(m => m.Value).OrderBy(x => x).ToArray();
            var actual = placeholder.Matches(italian).Select(m => m.Value).OrderBy(x => x).ToArray();

            Assert.True(expected.SequenceEqual(actual), $"Placeholders differ for: {english}");
        }
    }

    [Fact]
    public void No_translation_is_empty_or_identical_to_the_english_by_mistake()
    {
        // A few short words are the same in both languages on purpose.
        var same = new HashSet<string> { "Min", "Max" };
        foreach (var (english, italian) in Loc.ItalianTexts)
        {
            Assert.False(string.IsNullOrWhiteSpace(italian), english);
            if (!same.Contains(english))
            {
                Assert.NotEqual(english, italian);
            }
        }
    }
}

public class LanguageStateTests
{
    [Theory]
    [InlineData("it", "it")]
    [InlineData("IT", "it")]
    [InlineData(" it ", "it")]
    [InlineData("en", "en")]
    [InlineData("fr", "en")]
    [InlineData("", "en")]
    [InlineData(null, "en")]
    public void Anything_that_is_not_italian_is_english(string? input, string expected)
    {
        Assert.Equal(expected, LanguageState.Normalize(input));
    }

    [Fact]
    public void A_saved_cookie_wins_over_the_browser_language()
    {
        Assert.Equal("en", LanguageState.Resolve("en", "it-IT,it;q=0.9"));
        Assert.Equal("it", LanguageState.Resolve("it", "en-US,en;q=0.9"));
    }

    [Theory]
    [InlineData("it-IT,it;q=0.9,en;q=0.8", "it")]
    [InlineData("it", "it")]
    [InlineData("en-US,en;q=0.9,it;q=0.8", "en")]
    [InlineData("de-DE", "en")]
    [InlineData("", "en")]
    [InlineData(null, "en")]
    public void Without_a_cookie_the_first_browser_language_decides(string? header, string expected)
    {
        Assert.Equal(expected, LanguageState.Resolve(null, header));
    }

    [Fact]
    public void An_unknown_cookie_value_is_ignored()
    {
        Assert.Equal("it", LanguageState.Resolve("fr", "it-IT"));
        Assert.Equal("en", LanguageState.Resolve("fr", "en-US"));
    }

    [Fact]
    public void The_default_is_english()
    {
        Assert.Equal("en", new LanguageState().Current);
    }

    [Fact]
    public void Set_notifies_subscribers_only_when_the_language_changes()
    {
        var state = new LanguageState("en");
        var notifications = 0;
        state.Changed += () => notifications++;

        state.Set("en");
        state.Set("it");
        state.Set("it");
        state.Set("en");

        Assert.Equal(2, notifications);
        Assert.Equal("en", state.Current);
    }

    [Fact]
    public void Initialize_does_not_notify()
    {
        var state = new LanguageState();
        var notified = false;
        state.Changed += () => notified = true;

        state.Initialize("it");

        Assert.False(notified);
        Assert.True(state.IsItalian);
    }
}

public class LocalizedPagesTests : DashboardTestBase
{
    private IRenderedComponent<ProductDetail> RenderDetailWithForecast()
    {
        Api.LatestForecast = ApiResult<ForecastRunDto>.Ok(Samples.Forecast());
        var cut = Render<ProductDetail>(p => p.Add(c => c.Id, 5));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("svg.chart")));
        return cut;
    }

    [Fact]
    public void The_products_page_speaks_english_when_the_language_is_english()
    {
        Lang.Set("en");
        Api.Products = ApiResult<List<ProductDto>>.Ok(new List<ProductDto> { Samples.Product(1, "Bread", null) });

        var cut = Render<Products>();

        Assert.Equal("Products", cut.Find("h1").TextContent);
        Assert.Contains("New product", cut.FindAll("h2").Select(h => h.TextContent));
        Assert.Contains("Create", cut.FindAll("button").Select(b => b.TextContent));
        Assert.Contains("Created", cut.FindAll("th").Select(h => h.TextContent));
    }

    [Fact]
    public void The_products_page_switches_language_without_reloading()
    {
        Lang.Set("en");
        var cut = Render<Products>();
        Assert.Equal("Products", cut.Find("h1").TextContent);

        Lang.Set("it");

        cut.WaitForAssertion(() => Assert.Equal("Prodotti", cut.Find("h1").TextContent));
        Assert.Contains("Nuovo prodotto", cut.FindAll("h2").Select(h => h.TextContent));
    }

    [Fact]
    public void An_empty_name_is_rejected_in_the_current_language()
    {
        Lang.Set("en");
        var cut = Render<Products>();

        ButtonByText(cut, "Create").Click();

        Assert.Equal("Enter a name.", cut.Find(".alert-error").TextContent);
    }

    [Fact]
    public void The_product_page_speaks_english_when_the_language_is_english()
    {
        Lang.Set("en");

        var cut = RenderDetailWithForecast();

        var headings = cut.FindAll("h2").Select(h => h.TextContent).ToArray();
        Assert.Equal(new[] { "Forecast", "Ask your data", "Sales", "Import sales from CSV" }, headings);
        Assert.Contains("Next 28 days", cut.Find("p.lead").TextContent);
        Assert.Contains("units", cut.Find("p.lead").TextContent);
        Assert.Contains("← All products", cut.Markup);
    }

    [Fact]
    public void The_product_page_formats_numbers_and_dates_in_english_style()
    {
        Lang.Set("en");

        var cut = RenderDetailWithForecast();

        // 60 days from 1 January 2025, English date style
        Assert.Contains("from 1 Jan 2025 to 1 Mar 2025", cut.Markup);
        var expectedTotal = Samples.Forecast().Forecast.Sum(p => p.Yhat);
        Assert.Contains(Fmt.Num(expectedTotal, 0, "en"), cut.Find("p.lead").TextContent);
    }

    [Fact]
    public void Switching_to_italian_redraws_the_product_page_and_asks_for_the_italian_explanation()
    {
        Lang.Set("en");
        var cut = RenderDetailWithForecast();
        Assert.Equal(("en", false), Api.ExplanationCalls.Last());

        Lang.Set("it");

        cut.WaitForAssertion(() => Assert.Contains("Previsione", cut.FindAll("h2").Select(h => h.TextContent)));
        cut.WaitForAssertion(() => Assert.Equal(("it", false), Api.ExplanationCalls.Last()));
        Assert.Contains("Prossimi 28 giorni", cut.Find("p.lead").TextContent);
    }

    [Fact]
    public void The_example_questions_follow_the_interface_language()
    {
        Lang.Set("en");
        var cut = RenderDetailWithForecast();

        var english = cut.FindAll("button.chip").Select(b => b.TextContent).ToList();
        Assert.Equal(6, english.Count);
        Assert.Contains("What should I order?", english);

        Lang.Set("it");

        cut.WaitForAssertion(() => Assert.Contains("Cosa conviene ordinare?", cut.FindAll("button.chip").Select(b => b.TextContent)));
    }

    [Fact]
    public void Questions_are_sent_with_the_current_language()
    {
        Lang.Set("en");
        var cut = RenderDetailWithForecast();

        FieldInLabel(cut, "Your question").Input("How much did I sell?");
        ButtonByText(cut, "Ask").Click();

        cut.WaitForAssertion(() => Assert.Equal("en", Api.AskLanguages.Single()));
    }

    [Fact]
    public void Backend_error_prefixes_follow_the_language()
    {
        Lang.Set("en");
        Api.CreateForecastResult = ApiResult<ForecastRunDto>.Fail(422, "At least 42 days of sales are required: found 10.");
        var cut = Render<ProductDetail>(p => p.Add(c => c.Id, 5));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));

        ButtonByText(cut, "Compute forecast").Click();

        cut.WaitForAssertion(() =>
            Assert.Equal("Invalid data: At least 42 days of sales are required: found 10.", cut.Find(".alert-error").TextContent));
    }

    [Fact]
    public void Page_not_found_speaks_the_current_language()
    {
        Lang.Set("en");
        var cut = Render<NotFoundPage>();
        Assert.Equal("Page not found", cut.Find("h1").TextContent);

        Lang.Set("it");

        cut.WaitForAssertion(() => Assert.Equal("Pagina non trovata", cut.Find("h1").TextContent));
    }

    [Fact]
    public void The_chart_legend_and_axis_follow_the_language()
    {
        Lang.Set("en");
        var cut = Render<ForecastChart>(p => p
            .Add(c => c.History, (IReadOnlyList<SalePointDto>)Samples.Sales(60))
            .Add(c => c.Forecast, Samples.Forecast()));

        var legend = cut.Find(".legend").TextContent;
        Assert.Contains("History", legend);
        Assert.Contains("Likely range", legend);
        var dateLabels = cut.FindAll("text.tick").Where(t => t.TextContent.Contains("Jan") || t.TextContent.Contains("Feb")
            || t.TextContent.Contains("Mar") || t.TextContent.Contains("Apr")).ToList();
        Assert.NotEmpty(dateLabels);
        Assert.Empty(cut.FindAll("text.tick").Where(t => t.TextContent.Contains('/')));

        Lang.Set("it");

        cut.WaitForAssertion(() => Assert.Contains("Storico", cut.Find(".legend").TextContent));
        Assert.NotEmpty(cut.FindAll("text.tick").Where(t => t.TextContent.Contains('/')));
    }
}

public class LanguageSwitchTests : DashboardTestBase
{
    [Fact]
    public void The_switch_marks_the_current_language()
    {
        Lang.Set("en");

        var cut = Render<LanguageSwitch>();

        var on = cut.FindAll("button.on");
        Assert.Single(on);
        Assert.Equal("EN", on[0].TextContent);
    }

    [Fact]
    public void Clicking_it_changes_the_language_and_remembers_the_choice()
    {
        Lang.Set("en");
        var cut = Render<LanguageSwitch>();

        cut.FindAll("button").First(b => b.TextContent == "IT").Click();

        Assert.Equal("it", Lang.Current);
        cut.WaitForAssertion(() => Assert.Equal("IT", cut.Find("button.on").TextContent));
        JSInterop.VerifyInvoke("lumenxSetLang");
    }

    [Fact]
    public void Clicking_the_current_language_does_nothing_visible()
    {
        Lang.Set("it");
        var cut = Render<LanguageSwitch>();

        cut.FindAll("button").First(b => b.TextContent == "IT").Click();

        Assert.Equal("it", Lang.Current);
        Assert.Equal("IT", cut.Find("button.on").TextContent);
    }
}
