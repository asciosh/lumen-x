# Lumen-X · Dashboard (Blazor Server)

Web dashboard for products, sales (CSV import), forecasts, plain-language explanations, reorder suggestions and
questions about the data. It talks only to the backend (`backend/`), never directly to the Python service.

The interface is **bilingual: English and Italian**. It starts in English (or in Italian if the browser prefers it)
and the **EN / IT** switch in the header changes it instantly; the choice is remembered in a cookie.

## Run with Docker Compose (from the repo root)

```bash
docker compose up --build
```

- Dashboard: port **8081** (in a Codespace: *Ports* tab → open 8081)
- Backend: port 8080 · Forecasting: port 8000

## Run in development (without a container for the dashboard)

With the backend and services already running (`docker compose up -d db forecasting backend`):

```bash
cd dashboard/src/LumenX.Dashboard
dotnet run --urls http://0.0.0.0:8081
```

The backend URL is in `appsettings.json` (`Backend:BaseUrl`, default `http://localhost:8080`);
it can be overridden with the `Backend__BaseUrl` environment variable.

## .NET version

A single place: `dashboard/Directory.Build.props` (`PackagesMajor`, default 10). The Dockerfiles use the
`DOTNET_MAJOR` argument (compose: `DOTNET_MAJOR` variable, default 10). Keep it aligned with `backend/`.

## Structure

- `Services/` typed client to the backend (`ILumenApiClient`), DTOs, number and date formatting (`Fmt`),
  the translation dictionary (`Loc`) and the language state (`LanguageState`)
- `Components/App.razor` the page shell: it picks the starting language (cookie, then browser language)
- `Components/Pages/Products.razor` product list and creation
- `Components/Pages/ProductDetail.razor` forecast, explanation, reorder, **Ask your data** box, sales with filter, CSV import
- `Components/ForecastChart.razor` SVG chart (history + forecast + interval)
- `Components/LanguageSwitch.razor` the EN / IT switch; `Components/LocalizedComponentBase.cs` base class of the components with texts

## Languages

Texts are written in English in the markup (`@T("Compute forecast")`) and the Italian version lives in one
dictionary, `Services/Loc.cs`, keyed by the English text. A text with no Italian entry simply shows in English.
To add a text:

1. write it in English with `@T("...")` (use `{0}`, `{1}` for values: `@T("Next {0} days", n)`);
2. add the Italian version to `Loc.cs`.

Numbers and dates follow the language (`1,234.5` and `31 Mar 2026` in English, `1.234,5` and `31/03/2026` in
Italian). Error messages that come from the backend are in English and are shown as they are.
The whole app is one interactive Blazor circuit per browser tab, so the language switch works without reloading
and the choice persists while navigating between pages.

The questions typed in the **Ask your data** box are answered in the interface language, and the example questions
change with it.

## Tests

```bash
dotnet test dashboard/tests/LumenX.Dashboard.Tests
```

The tests use [bUnit](https://bunit.dev) (2.x, supports .NET 10) to render the pages in memory and check their
content, with a fake `ILumenApiClient` in place of the backend: no network, no Docker. The page tests start in
Italian (so they check the Italian texts); `LocalizationTests.cs` checks the English texts, the switch, the
dictionary (every translation keeps the same placeholders) and how the language is chosen at startup.
They cover the product list, the product page (sales, forecast, explanation and its notes, reorder, questions),
the chart, the HTTP client (addresses, errors, timeouts) and formatting.
They do not cover the look (colors, element positions) nor the CSV upload: for those, check by hand.

## Look

Dark "ink and amber" theme, taken from the repository's preview image: background `#0f1117`, cream text `#fef4e2`,
amber `#fcbb47` as the only action color and dark amber for the uncertainty band.
The chart is the main element: the history line is solid and luminous, the forecast is dashed and the likely
range sits behind it; the dot marks where the data ends and the forecast begins.

- All colors and fonts are variables in `wwwroot/app.css` (the `:root` block): to change the theme, edit there.
- Fonts are embedded in `wwwroot/fonts` (no requests to external services): **Bricolage Grotesque** for headings
  and numbers, **Figtree** for text and tables. SIL Open Font License 1.1, texts next to the files.
- There is a single motion: the line draws itself on first load. With "reduce motion" enabled in the system there
  is no animation.
- The demo page (`docs/demo`) uses the same `app.css` and fonts: if you change the dashboard look, copy `app.css`
  and the `fonts` folder there again.
