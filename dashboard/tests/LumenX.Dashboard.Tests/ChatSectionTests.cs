using Bunit;
using LumenX.Dashboard.Components.Pages;
using LumenX.Dashboard.Services;
using LumenX.Dashboard.Tests.TestSupport;

namespace LumenX.Dashboard.Tests;

public class ChatSectionTests : DashboardTestBase
{
    private IRenderedComponent<ProductDetail> RenderDetail()
    {
        var cut = Render<ProductDetail>(p => p.Add(c => c.Id, 5));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));
        return cut;
    }

    private static void Ask(IRenderedComponent<ProductDetail> cut, string question)
    {
        FieldInLabel(cut, "La tua domanda").Input(question);
        ButtonByText(cut, "Chiedi").Click();
    }

    [Fact]
    public void The_section_is_there_even_without_a_forecast()
    {
        var cut = RenderDetail();

        Assert.Contains("Chiedi ai tuoi dati", cut.FindAll("h2").Select(h => h.TextContent));
        Assert.Empty(cut.FindAll("div.turn"));
    }

    [Fact]
    public void Example_questions_are_offered_as_buttons()
    {
        var cut = RenderDetail();

        var examples = cut.FindAll("button.chip").Select(b => b.TextContent).ToList();

        Assert.Equal(6, examples.Count);
        Assert.Contains("Quanto ho venduto negli ultimi 30 giorni?", examples);
        Assert.Contains("Cosa conviene ordinare?", examples);
    }

    [Fact]
    public void Typing_a_question_and_asking_shows_the_answer()
    {
        var cut = RenderDetail();

        Ask(cut, "Quanto ho venduto?");

        cut.WaitForAssertion(() => Assert.Equal("Risposta a: Quanto ho venduto?", cut.Find("div.turn .a").TextContent));
        Assert.Equal((5, "Quanto ho venduto?"), Api.AskCalls.Single());
        Assert.Equal("Quanto ho venduto?", cut.Find("div.turn .q").TextContent);
    }

    [Fact]
    public void The_question_is_sent_with_the_interface_language()
    {
        var cut = RenderDetail();

        Ask(cut, "Quanto ho venduto?");

        cut.WaitForAssertion(() => Assert.Equal("it", Api.AskLanguages.Single()));
    }

    [Fact]
    public void Clicking_an_example_asks_it_straight_away()
    {
        var cut = RenderDetail();

        ButtonByText(cut, "Cosa conviene ordinare?").Click();

        cut.WaitForAssertion(() => Assert.Equal("Risposta a: Cosa conviene ordinare?", cut.Find("div.turn .a").TextContent));
        Assert.Equal("Cosa conviene ordinare?", Api.AskCalls.Single().Question);
    }

    [Fact]
    public void The_input_is_cleared_after_a_successful_answer()
    {
        var cut = RenderDetail();

        Ask(cut, "Quanto ho venduto?");

        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("div.turn")));
        Assert.Equal("", FieldInLabel(cut, "La tua domanda").GetAttribute("value") ?? "");
    }

    [Fact]
    public void A_question_that_is_too_short_is_rejected_without_calling_the_backend()
    {
        var cut = RenderDetail();

        Ask(cut, "ab");

        Assert.Contains("almeno 3 caratteri", cut.Find(".alert-error").TextContent);
        Assert.Empty(Api.AskCalls);
    }

    [Fact]
    public void An_empty_question_is_rejected_too()
    {
        var cut = RenderDetail();

        ButtonByText(cut, "Chiedi").Click();

        Assert.Contains("almeno 3 caratteri", cut.Find(".alert-error").TextContent);
        Assert.Empty(Api.AskCalls);
    }

    [Fact]
    public void Backend_errors_are_shown_without_adding_a_turn()
    {
        Api.AskFactory = _ => ApiResult<AskResponseDto>.Fail(422, "Scrivi una domanda di almeno 3 e al massimo 300 caratteri.");
        var cut = RenderDetail();

        Ask(cut, "Quanto ho venduto?");

        cut.WaitForAssertion(() => Assert.Contains("Dati non validi:", cut.Find(".alert-error").TextContent));
        Assert.Empty(cut.FindAll("div.turn"));
    }

    [Fact]
    public void Backend_down_is_reported_in_plain_words()
    {
        Api.AskFactory = _ => ApiResult<AskResponseDto>.Fail(0, "Backend non raggiungibile.");
        var cut = RenderDetail();

        Ask(cut, "Quanto ho venduto?");

        cut.WaitForAssertion(() => Assert.Contains("Backend non raggiungibile.", cut.Find(".alert-error").TextContent));
    }

    [Fact]
    public void Newest_answer_comes_first()
    {
        var cut = RenderDetail();

        Ask(cut, "Prima domanda");
        cut.WaitForAssertion(() => Assert.Single(cut.FindAll("div.turn")));
        Ask(cut, "Seconda domanda");

        cut.WaitForAssertion(() => Assert.Equal(2, cut.FindAll("div.turn").Count));
        Assert.Equal(new[] { "Seconda domanda", "Prima domanda" }, cut.FindAll("div.turn .q").Select(q => q.TextContent).ToArray());
    }

    [Fact]
    public void Only_the_last_eight_turns_are_kept()
    {
        var cut = RenderDetail();

        for (var i = 1; i <= 10; i++)
        {
            Ask(cut, $"Domanda numero {i}");
            cut.WaitForAssertion(() => Assert.Equal(i, Api.AskCalls.Count));
        }

        var questions = cut.FindAll("div.turn .q").Select(q => q.TextContent).ToList();
        Assert.Equal(8, questions.Count);
        Assert.Equal("Domanda numero 10", questions.First());
        Assert.Equal("Domanda numero 3", questions.Last());
    }

    [Fact]
    public void A_not_understood_question_still_shows_the_explanation_of_what_to_ask()
    {
        Api.AskFactory = q => ApiResult<AskResponseDto>.Ok(new AskResponseDto(
            q, "it", "unknown", false, "Non ho capito la domanda. Posso rispondere su: vendite in un periodo.", new List<string>()));
        var cut = RenderDetail();

        Ask(cut, "Che tempo fa?");

        cut.WaitForAssertion(() => Assert.Contains("Non ho capito la domanda", cut.Find("div.turn .a").TextContent));
    }

    [Fact]
    public void The_answer_text_is_shown_as_text_and_not_as_html()
    {
        Api.AskFactory = q => ApiResult<AskResponseDto>.Ok(new AskResponseDto(
            q, "it", "sales_total", true, "<b>grassetto</b> <script>alert(1)</script>", new List<string>()));
        var cut = RenderDetail();

        Ask(cut, "Quanto ho venduto?");

        cut.WaitForAssertion(() => Assert.Contains("<b>grassetto</b>", cut.Find("div.turn .a").TextContent));
        Assert.Empty(cut.FindAll("div.turn .a b"));
        Assert.Empty(cut.FindAll("div.turn .a script"));
    }

    [Fact]
    public void Changing_product_clears_the_conversation()
    {
        var cut = Render<ProductDetail>(p => p.Add(c => c.Id, 5));
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("h1")));
        Ask(cut, "Quanto ho venduto?");
        cut.WaitForAssertion(() => Assert.NotEmpty(cut.FindAll("div.turn")));

        cut.Render(p => p.Add(c => c.Id, 6));

        cut.WaitForAssertion(() => Assert.Empty(cut.FindAll("div.turn")));
    }
}
