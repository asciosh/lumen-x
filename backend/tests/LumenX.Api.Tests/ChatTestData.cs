using LumenX.Api.Chat;
using LumenX.Api.Contracts;
using LumenX.Api.Forecasting;

namespace LumenX.Api.Tests;

/// <summary>
/// Storico inventato, facile da verificare a mano: 90 giorni dal 1 gennaio al 31 marzo 2026, con
/// quantita' = 100 + 10 x (giorno della settimana, domenica = 0) + 10 x (numero di settimana trascorsa).
/// Forecast di prova: 28 giorni dal 1 aprile 2026 a 150 unita' (fascia 140-160), errore del metodo (RMSE) 10.
/// </summary>
public static class ChatTestData
{
    public static readonly DateOnly FirstDay = new(2026, 1, 1);

    public static List<SalePointDto> SalesHistory(int days = 90)
    {
        return Enumerable.Range(0, days)
            .Select(i =>
            {
                var date = FirstDay.AddDays(i);
                return new SalePointDto(date, 100 + 10 * (int)date.DayOfWeek + 10 * (i / 7));
            })
            .ToList();
    }

    public static List<SalePointDto> ConstantSales(int days, double quantity) =>
        Enumerable.Range(0, days).Select(i => new SalePointDto(FirstDay.AddDays(i), quantity)).ToList();

    public static ForecastRunDto Forecast(int days = 28, string method = "blend", bool withNaive = true)
    {
        var start = new DateOnly(2026, 4, 1);
        var points = Enumerable.Range(0, days)
            .Select(i => new ForecastPointView(start.AddDays(i), 150.0, 140.0, 160.0))
            .ToList();

        var backtest = new Dictionary<string, BacktestMetrics>
        {
            [method] = new BacktestMetrics { Mae = 8.0, Rmse = 10.0 }
        };
        if (withNaive && method != "naive")
        {
            backtest["naive"] = new BacktestMetrics { Mae = 12.0, Rmse = 15.0 };
        }

        return new ForecastRunDto(3, 1, DateTime.UtcNow, "auto", method, days, 28, 0, null, backtest, points);
    }

    public static AskContext Context(bool withForecast = true, double zeroDaysPercent = 0, List<SalePointDto>? sales = null) =>
        new("Pane", sales ?? SalesHistory(), withForecast ? Forecast() : null, zeroDaysPercent);

    public static string Ask(string question, string language = "it", AskContext? context = null) =>
        DataQuestionAnswerer.Answer(question, language, context ?? Context()).Text;
}
