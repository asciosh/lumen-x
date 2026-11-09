namespace LumenX.Dashboard.Services;

/// <summary>
/// The language of the interface ("en" or "it") for one browser session (one circuit). Components subscribe to
/// <see cref="Changed"/> to redraw themselves when the user switches language.
/// </summary>
public sealed class LanguageState
{
    public const string English = "en";
    public const string Italian = "it";

    public LanguageState()
    {
    }

    public LanguageState(string? initial)
    {
        Current = Normalize(initial);
    }

    public string Current { get; private set; } = English;

    public bool IsItalian => Current == Italian;

    public event Action? Changed;

    /// <summary>Sets the starting language without notifying anyone (used before the first render).</summary>
    public void Initialize(string? language) => Current = Normalize(language);

    /// <summary>Changes language and notifies the subscribers, unless it is already the current one.</summary>
    public void Set(string? language)
    {
        var next = Normalize(language);
        if (next == Current)
        {
            return;
        }

        Current = next;
        Changed?.Invoke();
    }

    /// <summary>Anything that is not Italian is English.</summary>
    public static string Normalize(string? language) =>
        string.Equals(language?.Trim(), Italian, StringComparison.OrdinalIgnoreCase) ? Italian : English;

    /// <summary>
    /// The language to start with: a saved choice (cookie) wins; otherwise the browser's first preferred
    /// language if it is Italian; otherwise English.
    /// </summary>
    public static string Resolve(string? cookieValue, string? acceptLanguageHeader)
    {
        if (!string.IsNullOrWhiteSpace(cookieValue))
        {
            var saved = cookieValue.Trim().ToLowerInvariant();
            if (saved == Italian || saved == English)
            {
                return saved;
            }
        }

        var first = (acceptLanguageHeader ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault() ?? "";
        return first.StartsWith("it", StringComparison.OrdinalIgnoreCase) ? Italian : English;
    }
}
