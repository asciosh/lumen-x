using LumenX.Api.Chat;

namespace LumenX.Api.Tests;

public class QuestionTextTests
{
    [Fact]
    public void Normalize_removes_accents_and_punctuation()
    {
        Assert.Equal("qual e il giorno piu forte", QuestionText.Normalize("Qual è il giorno più forte?"));
    }

    [Fact]
    public void Normalize_splits_at_apostrophes_and_collapses_spaces()
    {
        Assert.Equal("l ultimo mese", QuestionText.Normalize("  L'ultimo    MESE!! "));
    }

    [Fact]
    public void Normalize_keeps_digits()
    {
        Assert.Equal("ultimi 30 giorni", QuestionText.Normalize("Ultimi 30 giorni?"));
    }

    [Fact]
    public void Tokens_are_the_words_of_the_normalized_text()
    {
        Assert.Equal(new[] { "ultimi", "30", "giorni" }, QuestionText.Tokens("ultimi 30 giorni"));
    }

    [Fact]
    public void Every_italian_example_is_recognized_as_italian()
    {
        foreach (var question in DataQuestionAnswerer.Examples("it"))
        {
            Assert.Equal("it", QuestionText.DetectLanguage(QuestionText.Normalize(question)));
        }
    }

    [Fact]
    public void Every_english_example_is_recognized_as_english()
    {
        foreach (var question in DataQuestionAnswerer.Examples("en"))
        {
            Assert.Equal("en", QuestionText.DetectLanguage(QuestionText.Normalize(question)));
        }
    }

    [Fact]
    public void Unclear_language_defaults_to_italian()
    {
        Assert.Equal("it", QuestionText.DetectLanguage(QuestionText.Normalize("ciao")));
    }
}
