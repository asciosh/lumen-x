using LumenX.Api.Explanations;

namespace LumenX.Api.Tests;

public class TemplateExplainerTests
{
    [Fact]
    public void Italian_text_uses_italian_words_and_number_format()
    {
        var text = TemplateExplainer.Explain(ExplanationTestData.Facts(), "it");

        Assert.Contains("Caffè", text);
        Assert.Contains("3.360", text);        // Italian-style thousands separator
        Assert.Contains("28 giorni", text);
        Assert.Contains("20% in più", text);
        Assert.Contains("sabato", text);
        Assert.Contains("lunedì", text);
        Assert.Contains("naive", text);
    }

    [Fact]
    public void English_text_uses_english_words_and_number_format()
    {
        var text = TemplateExplainer.Explain(ExplanationTestData.Facts(), "en");

        Assert.Contains("Caffè", text);
        Assert.Contains("3,360", text);
        Assert.Contains("28 days", text);
        Assert.Contains("20% higher", text);
        Assert.Contains("Saturday", text);
        Assert.Contains("naive", text);
    }

    [Fact]
    public void Negative_change_is_described_as_lower()
    {
        var facts = ExplanationTestData.Facts() with { ChangePercent = -15.0 };

        Assert.Contains("15% in meno", TemplateExplainer.Explain(facts, "it"));
        Assert.Contains("15% lower", TemplateExplainer.Explain(facts, "en"));
    }

    [Fact]
    public void Small_change_is_described_as_in_line()
    {
        var facts = ExplanationTestData.Facts() with { ChangePercent = 0.5 };

        Assert.Contains("in linea", TemplateExplainer.Explain(facts, "it"));
        Assert.Contains("in line", TemplateExplainer.Explain(facts, "en"));
    }

    [Fact]
    public void Missing_optional_facts_are_simply_left_out()
    {
        var facts = ExplanationTestData.Facts() with
        {
            ChangePercent = null,
            StrongestWeekday = null,
            StrongestWeekdayAvg = null,
            WeakestWeekday = null,
            WeakestWeekdayAvg = null,
            IntervalHalfWidthPercent = null,
            MaeUsed = null,
            ImprovementVsNaivePercent = null
        };

        var text = TemplateExplainer.Explain(facts, "it");

        Assert.Contains("Caffè", text);
        Assert.DoesNotContain("giorno più forte", text);
        Assert.DoesNotContain("intervallo", text);
        Assert.DoesNotContain("verifica", text);
    }

    [Fact]
    public void Filled_missing_days_are_mentioned()
    {
        var facts = ExplanationTestData.Facts() with { FilledMissingDays = 3 };

        Assert.Contains("3 giorni di dati", TemplateExplainer.Explain(facts, "it"));
        Assert.Contains("3 days of history", TemplateExplainer.Explain(facts, "en"));
    }

    [Fact]
    public void Unknown_language_falls_back_to_italian()
    {
        var text = TemplateExplainer.Explain(ExplanationTestData.Facts(), "xx");

        Assert.Contains("prevedo", text);
    }

    [Fact]
    public void Many_zero_days_add_a_reliability_warning()
    {
        var facts = ExplanationTestData.Facts() with { ZeroDaysPercent = 25.0 };

        var it = TemplateExplainer.Explain(facts, "it");
        var en = TemplateExplainer.Explain(facts, "en");

        Assert.Contains("25% dei giorni ha vendite pari a zero", it);
        Assert.Contains("poco affidabile", it);
        Assert.Contains("25% of the days", en);
        Assert.Contains("intermittent", en);
    }

    [Fact]
    public void Few_zero_days_add_no_warning()
    {
        var facts = ExplanationTestData.Facts() with { ZeroDaysPercent = 5.0 };

        Assert.DoesNotContain("zero", TemplateExplainer.Explain(facts, "it"));
        Assert.DoesNotContain("zero sales", TemplateExplainer.Explain(facts, "en"));
    }

    [Fact]
    public void Blend_method_is_written_in_full()
    {
        var facts = ExplanationTestData.Facts() with { MethodUsed = "blend" };

        var it = TemplateExplainer.Explain(facts, "it");
        var en = TemplateExplainer.Explain(facts, "en");

        Assert.Contains("media di ETS e LightGBM", it);
        Assert.DoesNotContain("blend", it);
        Assert.Contains("average of ETS and LightGBM", en);
        Assert.DoesNotContain("blend", en);
    }
}
