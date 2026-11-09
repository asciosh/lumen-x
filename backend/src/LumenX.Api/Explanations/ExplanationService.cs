using Microsoft.Extensions.Options;

namespace LumenX.Api.Explanations;

/// <summary>
/// Chooses the source: template text (always available) or Gemini, if requested and configured.
/// If Gemini fails, it falls back to the template text.
/// </summary>
public sealed class ExplanationService
{
    private readonly TemplateExplainer _template;
    private readonly GeminiExplainer _gemini;
    private readonly GeminiOptions _options;
    private readonly ILogger<ExplanationService> _logger;

    public ExplanationService(
        TemplateExplainer template,
        GeminiExplainer gemini,
        IOptions<GeminiOptions> options,
        ILogger<ExplanationService> logger)
    {
        _template = template;
        _gemini = gemini;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<ExplanationResult> ExplainAsync(
        ExplanationFacts facts, string language, bool useAi, CancellationToken cancellationToken = default)
    {
        if (!useAi)
        {
            return await _template.ExplainAsync(facts, language, cancellationToken);
        }

        if (!_options.IsConfigured)
        {
            var plain = await _template.ExplainAsync(facts, language, cancellationToken);
            return plain with { Note = "ai_not_configured" };
        }

        try
        {
            return await _gemini.ExplainAsync(facts, language, cancellationToken);
        }
        catch (ExplanationUnavailableException ex)
        {
            _logger.LogWarning("Gemini not usable, using the template text: {Reason}", ex.Message);
            var plain = await _template.ExplainAsync(facts, language, cancellationToken);
            return plain with { Note = ex.Note };
        }
    }
}
