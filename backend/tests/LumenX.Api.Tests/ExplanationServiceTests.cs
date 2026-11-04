using System.Net;
using LumenX.Api.Explanations;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LumenX.Api.Tests;

public class ExplanationServiceTests
{
    private static ExplanationService Service(StubHandler handler, string? apiKey)
    {
        var gemini = ExplanationTestData.Gemini(handler, apiKey);
        return new ExplanationService(
            new TemplateExplainer(),
            gemini,
            Options.Create(ExplanationTestData.Options(apiKey)),
            NullLogger<ExplanationService>.Instance);
    }

    [Fact]
    public async Task Without_ai_the_template_is_used_and_gemini_is_not_called()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var service = Service(handler, "chiave-finta");

        var result = await service.ExplainAsync(ExplanationTestData.Facts(), "it", useAi: false);

        Assert.Equal("template", result.Source);
        Assert.Null(result.Note);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Ai_requested_but_not_configured_returns_template_with_note()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var service = Service(handler, null);

        var result = await service.ExplainAsync(ExplanationTestData.Facts(), "it", useAi: true);

        Assert.Equal("template", result.Source);
        Assert.Equal("ai_not_configured", result.Note);
        Assert.Equal(0, handler.Calls);
    }

    [Fact]
    public async Task Ai_requested_and_working_returns_gemini_text()
    {
        var handler = new StubHandler(() => StubHandler.Json(ExplanationTestData.GeminiOkJson));
        var service = Service(handler, "chiave-finta");

        var result = await service.ExplainAsync(ExplanationTestData.Facts(), "it", useAi: true);

        Assert.Equal("gemini", result.Source);
        Assert.Equal("Testo di prova da Gemini.", result.Text);
        Assert.Equal(1, handler.Calls);
    }

    [Fact]
    public async Task Gemini_failure_falls_back_to_template_with_note()
    {
        var handler = new StubHandler(() => StubHandler.Json("{}", HttpStatusCode.TooManyRequests));
        var service = Service(handler, "chiave-finta");

        var result = await service.ExplainAsync(ExplanationTestData.Facts(), "it", useAi: true);

        Assert.Equal("template", result.Source);
        Assert.Equal("ai_unavailable", result.Note);
        Assert.Contains("Caffè", result.Text);
    }
}
