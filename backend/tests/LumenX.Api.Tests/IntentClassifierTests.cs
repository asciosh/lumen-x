using LumenX.Api.Chat;

namespace LumenX.Api.Tests;

public class IntentClassifierTests
{
    private static DataIntent Classify(string question) =>
        IntentClassifier.Classify(QuestionText.Normalize(question)).Intent;

    [Theory]
    [InlineData("Quanto ho venduto negli ultimi 30 giorni?", DataIntent.SalesTotal)]
    [InlineData("Come vanno le vendite rispetto al mese scorso?", DataIntent.ComparePeriods)]
    [InlineData("Qual è il giorno più forte della settimana?", DataIntent.WeekdayPattern)]
    [InlineData("Quanto prevedo di vendere nelle prossime 2 settimane?", DataIntent.ForecastTotal)]
    [InlineData("Cosa conviene ordinare?", DataIntent.Reorder)]
    [InlineData("Quanto è affidabile la previsione?", DataIntent.Reliability)]
    [InlineData("Spiegami la previsione", DataIntent.Summary)]
    [InlineData("Qual è stato il giorno record?", DataIntent.PeakDay)]
    public void Italian_examples_map_to_their_intent(string question, DataIntent expected)
    {
        Assert.Equal(expected, Classify(question));
    }

    [Theory]
    [InlineData("How much did I sell in the last 30 days?", DataIntent.SalesTotal)]
    [InlineData("How are sales doing compared to last month?", DataIntent.ComparePeriods)]
    [InlineData("Which day of the week sells best?", DataIntent.WeekdayPattern)]
    [InlineData("How much will I sell in the next 2 weeks?", DataIntent.ForecastTotal)]
    [InlineData("What should I order?", DataIntent.Reorder)]
    [InlineData("How reliable is the forecast?", DataIntent.Reliability)]
    [InlineData("Explain the forecast", DataIntent.Summary)]
    [InlineData("What was my record day?", DataIntent.PeakDay)]
    public void English_examples_map_to_their_intent(string question, DataIntent expected)
    {
        Assert.Equal(expected, Classify(question));
    }

    [Theory]
    [InlineData("Quanto ho venduto a marzo?", DataIntent.SalesTotal)]
    [InlineData("Quante unità vendo in media al giorno?", DataIntent.SalesTotal)]
    [InlineData("Quanto devo ordinare nelle prossime settimane?", DataIntent.Reorder)]
    [InlineData("Quanto è precisa la previsione?", DataIntent.Reliability)]
    [InlineData("Dammi una sintesi", DataIntent.Summary)]
    [InlineData("Come andranno le vendite il prossimo mese?", DataIntent.ForecastTotal)]
    [InlineData("Come è andato l'ultimo mese rispetto al precedente?", DataIntent.ComparePeriods)]
    [InlineData("Qual è il giorno migliore della settimana?", DataIntent.WeekdayPattern)]
    [InlineData("Qual è stato il giorno migliore?", DataIntent.PeakDay)]
    [InlineData("Qual è il picco di vendite?", DataIntent.PeakDay)]
    [InlineData("Come vanno i sabati?", DataIntent.WeekdayPattern)]
    [InlineData("Should I trust the numbers?", DataIntent.Reliability)]
    [InlineData("quanto sbaglia il modello?", DataIntent.Reliability)]
    [InlineData("Quanto ho incassato a luglio?", DataIntent.SalesTotal)]
    [InlineData("Quanto ho fatturato a marzo?", DataIntent.SalesTotal)]
    [InlineData("What is my income?", DataIntent.SalesTotal)]
    [InlineData("Come vanno i ricavi rispetto al mese scorso?", DataIntent.ComparePeriods)]
    [InlineData("Quanto incasserò nelle prossime 2 settimane?", DataIntent.ForecastTotal)]
    public void Variations_are_understood(string question, DataIntent expected)
    {
        Assert.Equal(expected, Classify(question));
    }

    [Theory]
    [InlineData("Che tempo fa oggi?")]
    [InlineData("ciao")]
    [InlineData("Tell me a joke")]
    [InlineData("???")]
    public void Questions_outside_the_list_are_unknown_instead_of_guessed(string question)
    {
        var (intent, score) = IntentClassifier.Classify(QuestionText.Normalize(question));

        Assert.Equal(DataIntent.Unknown, intent);
        Assert.Equal(0, score);
    }

    [Theory]
    [InlineData("Quanto è affidabile la previsione dei prossimi giorni?", DataIntent.Reliability)]
    [InlineData("How reliable is the forecast for the next 2 weeks?", DataIntent.Reliability)]
    [InlineData("Spiegami la previsione dei prossimi giorni", DataIntent.Summary)]
    [InlineData("Cosa conviene ordinare per le prossime settimane in base alla previsione?", DataIntent.Reorder)]
    public void More_specific_questions_win_over_generic_ones(string question, DataIntent expected)
    {
        // They also contain words about "forecast" or "next days", but the real question is another.
        Assert.Equal(expected, Classify(question));
    }

    [Fact]
    public void Intent_codes_are_stable_snake_case_names()
    {
        Assert.Equal("sales_total", DataIntent.SalesTotal.ToCode());
        Assert.Equal("compare_periods", DataIntent.ComparePeriods.ToCode());
        Assert.Equal("weekday_pattern", DataIntent.WeekdayPattern.ToCode());
        Assert.Equal("peak_day", DataIntent.PeakDay.ToCode());
        Assert.Equal("forecast_total", DataIntent.ForecastTotal.ToCode());
        Assert.Equal("reorder", DataIntent.Reorder.ToCode());
        Assert.Equal("reliability", DataIntent.Reliability.ToCode());
        Assert.Equal("summary", DataIntent.Summary.ToCode());
        Assert.Equal("unknown", DataIntent.Unknown.ToCode());
    }
}
