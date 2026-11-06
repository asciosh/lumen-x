using LumenX.Api.Data;
using LumenX.Api.Endpoints;
using LumenX.Api.Explanations;
using LumenX.Api.Forecasting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<LumenXDbContext>((serviceProvider, options) =>
{
    var connectionString = serviceProvider.GetRequiredService<IConfiguration>().GetConnectionString("Default");
    if (string.IsNullOrWhiteSpace(connectionString))
    {
        throw new InvalidOperationException("Manca la stringa di connessione ConnectionStrings:Default.");
    }
    options.UseNpgsql(connectionString);
});

builder.Services.Configure<ForecastingOptions>(builder.Configuration.GetSection("Forecasting"));
builder.Services.AddHttpClient<IForecastingClient, ForecastingClient>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<ForecastingOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
});

builder.Services.Configure<GeminiOptions>(builder.Configuration.GetSection("Gemini"));
builder.Services.AddSingleton<TemplateExplainer>();
builder.Services.AddHttpClient<GeminiExplainer>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<GeminiOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
});
builder.Services.AddScoped<ExplanationService>();

var app = builder.Build();

DatabaseInitializer.Initialize(app);

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));
app.MapProductEndpoints();
app.MapSalesEndpoints();
app.MapForecastEndpoints();
app.MapExplanationEndpoints();
app.MapReorderEndpoints();

app.Run();

// Necessario perché WebApplicationFactory<Program> nei test possa vedere il tipo.
public partial class Program
{
}
