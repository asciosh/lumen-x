using LumenX.Api.Explanations;

namespace LumenX.Api.Tests;

public class NumberGuardTests
{
    private static ExplanationFacts Facts() => ExplanationTestData.Facts();

    [Theory]
    [InlineData("it")]
    [InlineData("en")]
    public void Template_text_never_contains_unsupported_numbers(string language)
    {
        var variants = new[]
        {
            Facts(),
            Facts() with { ZeroDaysPercent = 25.0, FilledMissingDays = 3, ChangePercent = -15.0 },
            Facts() with { ImprovementVsNaivePercent = -8.0, ChangePercent = 0.5 }
        };

        foreach (var facts in variants)
        {
            var text = TemplateExplainer.Explain(facts, language);
            Assert.Empty(NumberGuard.FindUnsupportedNumbers(text, facts, language));
        }
    }

    [Fact]
    public void Invented_percentage_is_reported()
    {
        var unsupported = NumberGuard.FindUnsupportedNumbers(
            "Le vendite cresceranno del 35% grazie al nuovo negozio.", Facts(), "it");

        Assert.Equal(new[] { "35" }, unsupported);
    }

    [Fact]
    public void Slightly_rounded_numbers_are_accepted()
    {
        // 3.360 written as 3.350: within 1%
        Assert.Empty(NumberGuard.FindUnsupportedNumbers("Prevedo circa 3.350 unità.", Facts(), "it"));
    }

    [Fact]
    public void Heavily_rounded_numbers_are_reported()
    {
        Assert.Equal(new[] { "3.400" },
            NumberGuard.FindUnsupportedNumbers("Prevedo circa 3.400 unità.", Facts(), "it"));
    }

    [Fact]
    public void English_separators_are_understood_in_english_text()
    {
        Assert.Empty(NumberGuard.FindUnsupportedNumbers("About 3,360 units, 20% higher.", Facts(), "en"));
    }

    [Fact]
    public void English_separators_in_italian_text_are_reported()
    {
        Assert.NotEmpty(NumberGuard.FindUnsupportedNumbers("Circa 3,360 unità.", Facts(), "it"));
    }

    [Fact]
    public void Numbers_in_dates_are_accepted()
    {
        var facts = Facts() with
        {
            ForecastStart = new DateOnly(2026, 5, 16),
            ForecastEnd = new DateOnly(2026, 6, 13)
        };

        Assert.Empty(NumberGuard.FindUnsupportedNumbers("Dal 16 maggio 2026 al 13 giugno 2026.", facts, "it"));
    }

    [Fact]
    public void Numbers_in_the_product_name_are_accepted()
    {
        var facts = Facts() with { ProductName = "Pane 2024 bio 500 g" };

        Assert.Empty(NumberGuard.FindUnsupportedNumbers("Per Pane 2024 bio 500 g prevedo circa 3.360 unità.", facts, "it"));
    }

    [Fact]
    public void Text_without_digits_has_no_unsupported_numbers()
    {
        Assert.Empty(NumberGuard.FindUnsupportedNumbers("Testo di prova senza cifre.", Facts(), "it"));
    }

    [Fact]
    public void The_same_unsupported_number_is_reported_once()
    {
        Assert.Equal(new[] { "35" }, NumberGuard.FindUnsupportedNumbers("35 e poi ancora 35.", Facts(), "it"));
    }
}
