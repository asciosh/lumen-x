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

        // In tests Gemini must never be called, whatever the machine's environment.
        builder.UseSetting("Gemini:ApiKey", "");

        builder.ConfigureTestServices(services =>
        {
            // 1) Remove Npgsql. With EF Core 9+ removing DbContextOptions<T> is not enough: also remove
            //    IDbContextOptionsConfiguration<T>. That type does not exist (publicly) in EF 8, so
            //    it is looked up by name: this way the code compiles with any version.
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

            // 2) Replace the client for the Python service with the fake.
            services.RemoveAll<IForecastingClient>();
            services.AddSingleton<IForecastingClient>(Fake);
        });
    }
}
