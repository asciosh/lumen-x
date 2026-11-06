using System.Net;
using LumenX.Api.Explanations;

namespace LumenX.Api.Tests;

public class GeminiExplainerTests
{
    [Fact]
    public async Task Successful_response_returns_the_text_with_source_gemini()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        var result = await explainer.ExplainAsync(ExplanationTestData.Facts(), "it");

        Assert.Equal("Testo di prova da Gemini.", result.Text);
        Assert.Equal("gemini", result.Source);
        Assert.Null(result.Note);
    }

    [Fact]
    public async Task Request_uses_header_for_the_key_and_the_configured_model()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await explainer.ExplainAsync(ExplanationTestData.Facts(), "en");

        Assert.Equal("chiave-finta", handler.LastApiKeyHeader);
        Assert.NotNull(handler.LastUri);
        Assert.DoesNotContain("chiave-finta", handler.LastUri!);   // la chiave non e' nell'URL
        Assert.Contains("models/test-model:generateContent", handler.LastUri);
        Assert.Contains("English", handler.LastBody);
        Assert.Contains("Caffè", handler.LastBody);
    }

    [Fact]
    public async Task Italian_request_asks_for_italian()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await explainer.ExplainAsync(ExplanationTestData.Facts(), "it");

        Assert.Contains("Italian", handler.LastBody);
    }

    [Fact]
    public async Task Http_error_becomes_explanation_unavailable()
    {
        var handler = new StubHandler(() => StubHandler.Json("{}", HttpStatusCode.TooManyRequests));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await Assert.ThrowsAsync<ExplanationUnavailableException>(
            () => explainer.ExplainAsync(ExplanationTestData.Facts(), "it"));
    }

    [Fact]
    public async Task Response_without_candidates_becomes_explanation_unavailable()
    {
        var handler = new StubHandler(() => StubHandler.Json("{\"promptFeedback\":{}}"));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await Assert.ThrowsAsync<ExplanationUnavailableException>(
            () => explainer.ExplainAsync(ExplanationTestData.Facts(), "it"));
    }

    [Fact]
    public async Task Malformed_json_becomes_explanation_unavailable()
    {
        var handler = new StubHandler(() => StubHandler.Json("non e' json"));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await Assert.ThrowsAsync<ExplanationUnavailableException>(
            () => explainer.ExplainAsync(ExplanationTestData.Facts(), "it"));
    }

    [Fact]
    public async Task Missing_key_does_not_call_the_network()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var explainer = ExplanationTestData.Gemini(handler, null);

        await Assert.ThrowsAsync<ExplanationUnavailableException>(
            () => explainer.ExplainAsync(ExplanationTestData.Facts(), "it"));
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Text_with_invented_numbers_is_rejected()
    {
        var json = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Le vendite cresceranno del 35% il prossimo mese.\"}]}}]}";
        var handler = new StubHandler(() => StubHandler.Json(json));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        var ex = await Assert.ThrowsAsync<ExplanationUnavailableException>(
            () => explainer.ExplainAsync(ExplanationTestData.Facts(), "it"));

        Assert.Equal("ai_rejected", ex.Note);
        Assert.Contains("35", ex.Message);
    }

    [Fact]
    public async Task Text_that_only_uses_the_facts_is_accepted()
    {
        var json = "{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Prevedo circa 3.360 unità in 28 giorni, il 20% in più.\"}]}}]}";
        var handler = new StubHandler(() => StubHandler.Json(json));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        var result = await explainer.ExplainAsync(ExplanationTestData.Facts(), "it");

        Assert.Equal("gemini", result.Source);
    }

    [Fact]
    public async Task Request_contains_the_zero_days_fact_and_the_rule_about_it()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await explainer.ExplainAsync(ExplanationTestData.Facts() with { ZeroDaysPercent = 30.0 }, "it");

        Assert.Contains("zeroDaysPercent", handler.LastBody);
        Assert.Contains("ZeroDaysPercent is 20 or more", handler.LastBody);
    }

    [Fact]
    public void Default_note_of_the_exception_is_ai_unavailable()
    {
        Assert.Equal("ai_unavailable", new ExplanationUnavailableException("x").Note);
    }

    [Fact]
    public async Task Request_explains_what_the_blend_method_is()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var explainer = ExplanationTestData.Gemini(handler, "chiave-finta");

        await explainer.ExplainAsync(ExplanationTestData.Facts() with { MethodUsed = "blend" }, "it");

        Assert.Contains("means the average of the ETS and LightGBM forecasts", handler.LastBody);
        Assert.Contains("blend", handler.LastBody);
    }
}
