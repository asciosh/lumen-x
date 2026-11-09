using LumenX.Api.Chat;
using static LumenX.Api.Tests.ChatTestData;

namespace LumenX.Api.Tests;

public class DataQuestionAnswererTests
{
    // ------------------------------------------------------------------ vendite in un periodo

    [Fact]
    public void Sales_in_the_last_30_days_are_summed_from_the_last_day_of_data()
    {
        var text = Ask("Quanto ho venduto negli ultimi 30 giorni?");

        Assert.Equal("Dal 02/03/2026 al 31/03/2026 (30 giorni) hai venduto 6.930 unità, cioè 231 al giorno.", text);
    }

    [Fact]
    public void Sales_in_a_named_month_use_the_calendar_month()
    {
        var text = Ask("Quanto ho venduto a febbraio?");

        Assert.Equal("A febbraio 2026 (28 giorni) hai venduto 5.300 unità, cioè 189 al giorno.", text);
    }

    [Fact]
    public void Sales_in_a_month_with_an_explicit_year()
    {
        Assert.Equal("A gennaio 2026 (31 giorni) hai venduto 4.630 unità, cioè 149 al giorno.", Ask("Quanto ho venduto a gennaio 2026?"));
    }

    [Fact]
    public void Sales_in_the_last_three_months_cover_the_whole_history()
    {
        Assert.Equal("Dal 01/01/2026 al 31/03/2026 (90 giorni) hai venduto 17.040 unità, cioè 189 al giorno.", Ask("Quanto ho venduto negli ultimi 3 mesi?"));
    }

    [Fact]
    public void Sales_without_a_period_default_to_the_last_30_days()
    {
        Assert.Equal(Ask("Quanto ho venduto negli ultimi 30 giorni?"), Ask("Quanto ho venduto?"));
    }

    [Fact]
    public void Sales_in_a_period_without_data_say_where_the_data_is()
    {
        var text = Ask("Quanto ho venduto a dicembre?");

        Assert.Equal("Non ho vendite tra il 01/12/2025 e il 31/12/2025: i dati vanno dal 01/01/2026 al 31/03/2026.", text);
    }

    [Fact]
    public void Sales_answer_in_english_uses_english_formats()
    {
        var text = Ask("How much did I sell in the last 30 days?", "en");

        Assert.Equal("From 2 Mar 2026 to 31 Mar 2026 (30 days) you sold 6,930 units, or 231 per day.", text);
    }

    // ------------------------------------------------------------------ confronto tra periodi

    [Fact]
    public void Compare_with_the_previous_week()
    {
        var text = Ask("Come vanno le vendite rispetto alla settimana scorsa?");

        Assert.Equal(
            "Negli ultimi 7 giorni (dal 25/03/2026 al 31/03/2026) hai venduto 1.740 unità, contro 1.670 nei 7 giorni precedenti: il 4,2% in più.",
            text);
    }

    [Fact]
    public void Compare_with_the_previous_month()
    {
        var text = Ask("Come vanno le vendite rispetto al mese scorso?");

        Assert.Equal(
            "Negli ultimi 30 giorni (dal 02/03/2026 al 31/03/2026) hai venduto 6.930 unità, contro 5.680 nei 30 giorni precedenti: il 22% in più.",
            text);
    }

    [Fact]
    public void Compare_in_english()
    {
        var text = Ask("How are sales doing compared to last week?", "en");

        Assert.Equal(
            "In the last 7 days (from 25 Mar 2026 to 31 Mar 2026) you sold 1,740 units, against 1,670 in the previous 7 days: 4.2% more.",
            text);
    }

    [Fact]
    public void Compare_says_when_nothing_changed()
    {
        var context = Context(sales: ConstantSales(90, 100));

        Assert.Contains("praticamente invariato", Ask("Come vanno le vendite rispetto alla settimana scorsa?", "it", context));
    }

    [Fact]
    public void Compare_says_when_the_previous_period_had_no_sales()
    {
        var sales = Enumerable.Range(0, 14)
            .Select(i => new LumenX.Api.Contracts.SalePointDto(FirstDay.AddDays(i), i < 7 ? 0 : 10))
            .ToList();

        var text = Ask("Come vanno le vendite rispetto alla settimana scorsa?", "it", Context(sales: sales));

        Assert.Contains("nel periodo precedente non risultano vendite", text);
    }

    [Fact]
    public void Compare_mentions_missing_days_and_shows_a_decrease()
    {
        var sales = SalesHistory().Where(s => s.Date != new DateOnly(2026, 3, 27)).ToList();

        var text = Ask("Come vanno le vendite rispetto alla settimana scorsa?", "it", Context(sales: sales));

        Assert.Contains("hai venduto 1.470 unità", text);
        Assert.Contains("il 12% in meno", text);
        Assert.Contains("Giorni con dati: 6 e 7.", text);
    }

    [Fact]
    public void Compare_needs_twice_the_period_of_history()
    {
        var text = Ask("Come vanno le vendite rispetto al mese scorso?", "it", Context(sales: SalesHistory(20)));

        Assert.Equal("Per confrontare due periodi da 30 giorni servono almeno 60 giorni di storico: ne ho 20 giorni.", text);
    }

    [Fact]
    public void Comparing_two_named_months_is_not_supported_yet()
    {
        Assert.Contains("non è ancora supportato", Ask("Vendite di aprile rispetto a marzo"));
    }

    // ------------------------------------------------------------------ giorni della settimana e record

    [Fact]
    public void Strongest_and_weakest_weekday_over_the_last_12_weeks()
    {
        var text = Ask("Qual è il giorno più forte della settimana?");

        Assert.Equal(
            "Guardando gli ultimi 84 giorni di dati, il giorno più forte è sabato (in media 225 unità) e il più debole domenica (165).",
            text);
    }

    [Fact]
    public void Weekday_pattern_in_english()
    {
        Assert.Equal(
            "Looking at the last 84 days of data, the strongest day is Saturday (about 225 units on average) and the weakest is Sunday (165).",
            Ask("Which day of the week sells best?", "en"));
    }

    [Fact]
    public void Even_sales_have_no_strongest_weekday()
    {
        var text = Ask("Qual è il giorno più forte della settimana?", "it", Context(sales: ConstantSales(40, 100)));

        Assert.Contains("molto regolari", text);
    }

    [Fact]
    public void Weekday_pattern_needs_two_weeks_of_data()
    {
        var text = Ask("Qual è il giorno più forte della settimana?", "it", Context(sales: ConstantSales(10, 100)));

        Assert.Contains("Servono almeno 14 giorni", text);
    }

    [Fact]
    public void Best_and_worst_day_over_the_last_90_days()
    {
        var text = Ask("Qual è stato il giorno record?");

        Assert.Equal(
            "Dal 01/01/2026 al 31/03/2026 il giorno migliore è stato 28/03/2026 (sabato) con 280 unità; il peggiore 04/01/2026 (domenica) con 100.",
            text);
    }

    [Fact]
    public void Best_and_worst_day_in_english()
    {
        Assert.Equal(
            "From 1 Jan 2026 to 31 Mar 2026 the best day was 28 Mar 2026 (Saturday) with 280 units; the worst was 4 Jan 2026 (Sunday) with 100.",
            Ask("What was my record day?", "en"));
    }

    // ------------------------------------------------------------------ previsione

    [Fact]
    public void Forecast_total_for_the_next_two_weeks()
    {
        var text = Ask("Quanto prevedo di vendere nelle prossime 2 settimane?");

        Assert.Equal("Per i prossimi 14 giorni (dal 01/04/2026 al 14/04/2026) prevedo circa 2.100 unità, 150 al giorno.", text);
    }

    [Fact]
    public void Forecast_total_without_a_period_covers_the_whole_horizon()
    {
        Assert.Equal(
            "Per i prossimi 28 giorni (dal 01/04/2026 al 28/04/2026) prevedo circa 4.200 unità, 150 al giorno.",
            Ask("Quanto prevedo di vendere?"));
    }

    [Fact]
    public void Forecast_total_longer_than_the_horizon_says_so()
    {
        var text = Ask("Quanto prevedo di vendere nei prossimi 60 giorni?");

        Assert.Contains("prevedo circa 4.200 unità", text);
        Assert.EndsWith("Il forecast copre solo 28 giorni: per andare oltre ricalcolalo con un orizzonte più lungo.", text);
    }

    [Fact]
    public void Forecast_total_in_english()
    {
        Assert.Equal(
            "For the next 14 days (from 1 Apr 2026 to 14 Apr 2026) I forecast about 2,100 units, 150 per day.",
            Ask("How much will I sell in the next 2 weeks?", "en"));
    }

    [Theory]
    [InlineData("Quanto prevedo di vendere nelle prossime 2 settimane?")]
    [InlineData("Cosa conviene ordinare?")]
    [InlineData("Quanto è affidabile la previsione?")]
    [InlineData("Spiegami la previsione")]
    public void Questions_about_the_forecast_say_when_there_is_none(string question)
    {
        var text = Ask(question, "it", Context(withForecast: false));

        Assert.Equal("Per questo prodotto non c'è ancora un forecast: calcolalo nella sezione Previsione e poi chiedimi pure.", text);
    }

    [Fact]
    public void Many_zero_days_add_a_warning_to_forecast_answers()
    {
        var text = Ask("Quanto prevedo di vendere nelle prossime 2 settimane?", "it", Context(zeroDaysPercent: 25));

        Assert.EndsWith("Attenzione: molti giorni a zero nello storico, quindi la previsione è poco affidabile.", text);
    }

    // ------------------------------------------------------------------ riordino

    [Fact]
    public void Reorder_uses_the_default_lead_time_review_and_service_level()
    {
        var text = Ask("Cosa conviene ordinare?");

        Assert.StartsWith("Per coprire i prossimi 14 giorni (7 di consegna e 7 tra un ordine e l'altro) con un livello di servizio del 95%:", text);
        Assert.Contains("domanda prevista 2.100", text);
        Assert.Contains("scorta di sicurezza 61,5", text);                 // 1,6449 x 10 x radice(14)
        Assert.Contains("livello massimo di circa 2.162 unità", text);
        Assert.Contains("riquadro Riordino", text);
    }

    [Fact]
    public void Reorder_in_english()
    {
        var text = Ask("What should I order?", "en");

        Assert.Contains("To cover the next 14 days (7 of delivery and 7 between orders) at a 95% service level", text);
        Assert.Contains("expected demand 2,100, safety stock 61.5", text);
        Assert.Contains("maximum level of about 2,162 units", text);
    }

    [Fact]
    public void Reorder_with_a_forecast_shorter_than_the_period_explains_what_to_do()
    {
        var context = new AskContext("Pane", SalesHistory(), Forecast(days: 10), 0);

        var text = Ask("Cosa conviene ordinare?", "it", context);

        Assert.Contains("orizzonte", text);
        Assert.Contains("14 giorni", text);
    }

    // ------------------------------------------------------------------ affidabilita' e spiegazione

    [Fact]
    public void Reliability_reports_method_error_range_and_gain_over_the_naive()
    {
        var text = Ask("Quanto è affidabile la previsione?");

        Assert.Equal(
            "Il metodo usato è la media di ETS e LightGBM. " +
            "Nei giorni di verifica ha sbagliato in media di 8,0 unità al giorno, circa il 5,3% delle vendite previste. " +
            "La fascia probabile è di circa ±6,7%. " +
            "È il 33% in meno del metodo semplice di confronto (naive).",
            text);
    }

    [Fact]
    public void Reliability_without_a_naive_backtest_has_no_comparison()
    {
        var context = new AskContext("Pane", SalesHistory(), Forecast(withNaive: false), 0);

        var text = Ask("Quanto è affidabile la previsione?", "it", context);

        Assert.DoesNotContain("naive", text);
        Assert.Contains("8,0 unità al giorno", text);
    }

    [Fact]
    public void Reliability_warns_about_intermittent_series()
    {
        var text = Ask("Quanto è affidabile la previsione?", "it", Context(zeroDaysPercent: 30));

        Assert.Contains("molti giorni a zero", text);
    }

    [Fact]
    public void Summary_is_the_rule_based_explanation_of_the_forecast()
    {
        var text = Ask("Spiegami la previsione");

        Assert.StartsWith("Per «Pane» prevedo circa 4.200 unità su 28 giorni", text);
    }

    [Fact]
    public void Summary_in_english()
    {
        var text = Ask("Explain the forecast", "en");

        Assert.StartsWith("For “Pane” I forecast about 4,200 units over 28 days", text);
    }

    // ------------------------------------------------------------------ casi limite

    [Fact]
    public void Unknown_question_says_what_can_be_asked_and_offers_examples()
    {
        var answer = DataQuestionAnswerer.Answer("Che tempo fa oggi?", "it", Context());

        Assert.False(answer.Understood);
        Assert.Equal(DataIntent.Unknown, answer.Intent);
        Assert.StartsWith("Non ho capito la domanda.", answer.Text);
        Assert.Equal(DataQuestionAnswerer.Examples("it"), answer.Suggestions);
        Assert.Equal(8, answer.Suggestions.Count);
    }

    [Fact]
    public void Unknown_question_in_english_gets_english_examples()
    {
        var answer = DataQuestionAnswerer.Answer("Tell me a joke", "en", Context());

        Assert.StartsWith("I did not understand the question.", answer.Text);
        Assert.Equal(DataQuestionAnswerer.Examples("en"), answer.Suggestions);
    }

    [Fact]
    public void Without_any_sales_the_answer_asks_for_an_import()
    {
        var text = Ask("Quanto ho venduto negli ultimi 30 giorni?", "it", Context(sales: new List<LumenX.Api.Contracts.SalePointDto>()));

        Assert.Contains("importa un CSV", text);
    }

    [Theory]
    [InlineData("it")]
    [InlineData("en")]
    public void Every_example_question_is_understood_and_answered(string language)
    {
        foreach (var question in DataQuestionAnswerer.Examples(language))
        {
            var answer = DataQuestionAnswerer.Answer(question, language, Context());

            Assert.True(answer.Understood, question);
            Assert.NotEqual(DataIntent.Unknown, answer.Intent);
            Assert.False(string.IsNullOrWhiteSpace(answer.Text), question);
            Assert.Empty(answer.Suggestions);
        }
    }

    [Fact]
    public void The_answer_reports_which_question_it_understood()
    {
        Assert.Equal(DataIntent.Reorder, DataQuestionAnswerer.Answer("Cosa conviene ordinare?", "it", Context()).Intent);
        Assert.Equal(DataIntent.PeakDay, DataQuestionAnswerer.Answer("Qual è il picco di vendite?", "it", Context()).Intent);
    }

    // ------------------------------------------------------------------ domande sui soldi

    [Fact]
    public void Revenue_questions_are_answered_with_units_and_an_honest_note()
    {
        var text = Ask("Quanto ho incassato a febbraio?");

        Assert.Equal(
            "Non conosco i prezzi, quindi non posso parlare di incassi: ti rispondo con le unità vendute. " +
            "A febbraio 2026 (28 giorni) hai venduto 5.300 unità, cioè 189 al giorno.",
            text);
    }

    [Fact]
    public void Revenue_note_in_english()
    {
        var text = Ask("How much revenue did I make in the last 30 days?", "en");

        Assert.Equal(
            "I do not have prices, so I cannot talk about revenue: here are the units sold. " +
            "From 2 Mar 2026 to 31 Mar 2026 (30 days) you sold 6,930 units, or 231 per day.",
            text);
    }

    [Fact]
    public void The_money_note_also_applies_to_forecast_answers()
    {
        var text = Ask("Quanto incasserò nelle prossime 2 settimane?");

        Assert.StartsWith("Non conosco i prezzi", text);
        Assert.Contains("prevedo circa 2.100 unità", text);
    }

    [Fact]
    public void Questions_without_money_words_have_no_note()
    {
        Assert.DoesNotContain("prezzi", Ask("Quanto ho venduto a febbraio?"));
    }

    [Fact]
    public void Reliability_answers_never_get_the_money_note()
    {
        Assert.DoesNotContain("Non conosco i prezzi", Ask("Quanto è affidabile il guadagno previsto?"));
    }
}
