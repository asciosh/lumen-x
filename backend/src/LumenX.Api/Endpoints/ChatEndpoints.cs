using LumenX.Api.Chat;
using LumenX.Api.Contracts;
using LumenX.Api.Data;
using LumenX.Api.Explanations;
using LumenX.Api.Forecasting;
using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Endpoints;

public static class ChatEndpoints
{
    private const int MinQuestionLength = 3;
    private const int MaxQuestionLength = 300;

    public static IEndpointRouteBuilder MapChatEndpoints(this IEndpointRouteBuilder app)
    {
        // Corpo: { "question": "...", "language": "it" | "en" }. La lingua e' facoltativa (si riconosce dalla domanda).
        app.MapPost("/products/{productId:int}/ask", AskAsync);
        return app;
    }

    private static async Task<IResult> AskAsync(
        int productId,
        AskRequest request,
        LumenXDbContext db,
        CancellationToken ct)
    {
        var question = request.Question?.Trim();
        if (string.IsNullOrEmpty(question) || question.Length < MinQuestionLength || question.Length > MaxQuestionLength)
        {
            return Problems.Unprocessable(
                $"Scrivi una domanda di almeno {MinQuestionLength} e al massimo {MaxQuestionLength} caratteri.");
        }

        string language;
        if (string.IsNullOrWhiteSpace(request.Language))
        {
            language = QuestionText.DetectLanguage(QuestionText.Normalize(question));
        }
        else
        {
            var requested = ExplanationLanguage.Normalize(request.Language);
            if (requested is null)
            {
                return Problems.Unprocessable("'language' deve essere 'it' oppure 'en'.");
            }

            language = requested;
        }

        var product = await db.Products
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == productId, ct);
        if (product is null)
        {
            return Problems.NotFound($"Prodotto {productId} non trovato.");
        }

        var sales = await db.SalesRecords
            .AsNoTracking()
            .Where(s => s.ProductId == productId)
            .OrderBy(s => s.Date)
            .Select(s => new SalePointDto(s.Date, s.Quantity))
            .ToListAsync(ct);

        var run = await db.ForecastRuns
            .AsNoTracking()
            .Include(r => r.Points)
            .Where(r => r.ProductId == productId)
            .OrderByDescending(r => r.Id)
            .FirstOrDefaultAsync(ct);

        var zeroDays = sales.Count(s => s.Quantity == 0);
        var zeroDaysPercent = sales.Count == 0 ? 0 : zeroDays * 100.0 / sales.Count;

        var context = new AskContext(
            product.Name,
            sales,
            run is null ? null : ForecastMapper.ToDto(run),
            zeroDaysPercent);

        var answer = DataQuestionAnswerer.Answer(question, language, context);

        return Results.Ok(new AskResponse(
            question,
            language,
            answer.Intent.ToCode(),
            answer.Understood,
            answer.Text,
            answer.Suggestions));
    }
}
