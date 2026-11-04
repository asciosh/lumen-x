using LumenX.Api.Data;
using LumenX.Api.Forecasting;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LumenX.Api.Tests;

public class LumenXFactory : WebApplicationFactory<Program>
{
    private readonly string _dbName = "lumenx-tests-" + Guid.NewGuid().ToString("N");

    public FakeForecastingClient Fake { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");

        // Nei test Gemini non deve mai essere chiamato, qualunque sia l'ambiente della macchina.
        builder.UseSetting("Gemini:ApiKey", "");

        builder.ConfigureTestServices(services =>
        {
            // 1) Rimuovere Npgsql. Con EF Core 9+ non basta DbContextOptions<T>: va tolta anche
            //    IDbContextOptionsConfiguration<T>. Quel tipo non esiste (pubblico) in EF 8, quindi
            //    lo cerco per nome: così il codice compila con qualsiasi versione.
            services.RemoveAll<DbContextOptions<LumenXDbContext>>();

            var optionsConfigurations = services
                .Where(d => d.ServiceType.IsGenericType
                            && d.ServiceType.Name.StartsWith("IDbContextOptionsConfiguration", StringComparison.Ordinal)
                            && d.ServiceType.GenericTypeArguments.Length == 1
                            && d.ServiceType.GenericTypeArguments[0] == typeof(LumenXDbContext))
                .ToList();
            foreach (var descriptor in optionsConfigurations)
            {
                services.Remove(descriptor);
            }

            services.AddDbContext<LumenXDbContext>(options => options.UseInMemoryDatabase(_dbName));

            // 2) Sostituire il client verso il servizio Python con il fake.
            services.RemoveAll<IForecastingClient>();
            services.AddSingleton<IForecastingClient>(Fake);
        });
    }
}
