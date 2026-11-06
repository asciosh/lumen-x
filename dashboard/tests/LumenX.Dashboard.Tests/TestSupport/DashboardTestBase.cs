using AngleSharp.Dom;
using Bunit;
using LumenX.Dashboard.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;

namespace LumenX.Dashboard.Tests.TestSupport;

/// <summary>Base dei test delle pagine: registra il finto client e semplifica la ricerca di campi e pulsanti.</summary>
public abstract class DashboardTestBase : BunitContext
{
    protected DashboardTestBase()
    {
        // InputFile e altri componenti chiamano JavaScript: nei test non serve, basta non fallire.
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<ILumenApiClient>(Api);
    }

    protected FakeLumenApiClient Api { get; } = new();

    /// <summary>Il campo (input o select) dentro l'etichetta che inizia con il testo indicato.</summary>
    protected static IElement FieldInLabel<T>(IRenderedComponent<T> cut, string labelStart) where T : IComponent =>
        cut.FindAll("label")
            .First(l => l.TextContent.Trim().StartsWith(labelStart, StringComparison.Ordinal))
            .QuerySelector("input, select")!;

    protected static IElement ButtonByText<T>(IRenderedComponent<T> cut, string text) where T : IComponent =>
        cut.FindAll("button").First(b => b.TextContent.Contains(text, StringComparison.Ordinal));

    /// <summary>Il valore (cella numerica) della riga di tabella che contiene il testo indicato.</summary>
    protected static string RowValue<T>(IRenderedComponent<T> cut, string rowLabel) where T : IComponent =>
        cut.FindAll("tr")
            .First(r => r.TextContent.Contains(rowLabel, StringComparison.Ordinal))
            .QuerySelector("td.num")!
            .TextContent.Trim();
}
