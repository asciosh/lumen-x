using LumenX.Dashboard.Services;
using Microsoft.AspNetCore.Components;

namespace LumenX.Dashboard.Components;

/// <summary>
/// Base class for components with texts in two languages: <c>T("English text")</c> returns the text in the current
/// language, and the component redraws itself when the user switches language.
/// </summary>
public abstract class LocalizedComponentBase : ComponentBase, IDisposable
{
    [Inject] protected LanguageState Lang { get; set; } = default!;

    protected string T(string english, params object[] args) => Loc.T(english, Lang.Current, args);

    protected string FmtNum(double value, int decimals = 1) => Fmt.Num(value, decimals, Lang.Current);

    protected string FmtMetric(double? value) => Fmt.Metric(value, Lang.Current);

    protected string FmtDate(DateOnly date) => Fmt.Date(date, Lang.Current);

    protected string FmtDateTime(DateTime date) => Fmt.DateTimeUtc(date, Lang.Current);

    protected override void OnInitialized()
    {
        Lang.Changed += HandleLanguageChanged;
    }

    /// <summary>Called when the language has changed, just before the component is redrawn.</summary>
    protected virtual void LanguageChanged()
    {
    }

    private void HandleLanguageChanged()
    {
        _ = InvokeAsync(() =>
        {
            LanguageChanged();
            StateHasChanged();
        });
    }

    public virtual void Dispose()
    {
        Lang.Changed -= HandleLanguageChanged;
    }
}
