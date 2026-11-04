using LumenX.Dashboard.Components;
using LumenX.Dashboard.Services;
using Microsoft.Extensions.Options;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRazorComponents().AddInteractiveServerComponents();

builder.Services.Configure<BackendOptions>(builder.Configuration.GetSection("Backend"));
builder.Services.AddHttpClient<ILumenApiClient, LumenApiClient>((serviceProvider, client) =>
{
    var options = serviceProvider.GetRequiredService<IOptions<BackendOptions>>().Value;
    client.BaseAddress = new Uri(options.BaseUrl.TrimEnd('/') + "/");
    client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
}

app.UseAntiforgery();
app.MapStaticAssets();

app.MapRazorComponents<App>().AddInteractiveServerRenderMode();

app.Run();
