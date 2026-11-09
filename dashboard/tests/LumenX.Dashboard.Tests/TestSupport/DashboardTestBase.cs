using AngleSharp.Dom;
using Bunit;
using LumenX.Dashboard.Services;
using Microsoft.AspNetCore.Components;
using Microsoft.Extensions.DependencyInjection;

namespace LumenX.Dashboard.Tests.TestSupport;

/// <summary>Base for page tests: registers the fake client and simplifies finding fields and buttons.</summary>
public abstract class DashboardTestBase : BunitContext
{
    protected DashboardTestBase()
    {
        // InputFile and other components call JavaScript: the tests don't need it, they just must not fail.
        JSInterop.Mode = JSRuntimeMode.Loose;
        Services.AddSingleton<ILumenApiClient>(Api);

        // The existing page tests check Italian texts, so the tests start in Italian (the app itself defaults to English).
        Lang = new LanguageState(LanguageState.Italian);
        Services.AddSingleton(Lang);
    }

    protected FakeLumenApiClient Api { get; } = new();

    protected LanguageState Lang { get; }

    /// <summary>The field (input or select) inside the label that starts with the given text.</summary>
    protected static IElement FieldInLabel<T>(IRenderedComponent<T> cut, string labelStart) where T : IComponent =>
        cut.FindAll("label")
            .First(l => l.TextContent.Trim().StartsWith(labelStart, StringComparison.Ordinal))
            .QuerySelector("input, select")!;

    protected static IElement ButtonByText<T>(IRenderedComponent<T> cut, string text) where T : IComponent =>
        cut.FindAll("button").First(b => b.TextContent.Contains(text, StringComparison.Ordinal));

    /// <summary>The value (numeric cell) of the table row that contains the given text.</summary>
    protected static string RowValue<T>(IRenderedComponent<T> cut, string rowLabel) where T : IComponent =>
        cut.FindAll("tr")
            .First(r => r.TextContent.Contains(rowLabel, StringComparison.Ordinal))
            .QuerySelector("td.num")!
            .TextContent.Trim();
}
