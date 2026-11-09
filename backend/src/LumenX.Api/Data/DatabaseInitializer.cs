using Microsoft.EntityFrameworkCore;

namespace LumenX.Api.Data;

public static class DatabaseInitializer
{
    /// <summary>
    /// Database:UseMigrations = false -> EnsureCreated (default, no migrations).
    /// Database:UseMigrations = true  -> Migrate (requires the migrations to exist).
    /// Retries a few times because Postgres may still be starting.
    /// </summary>
    public static void Initialize(WebApplication app)
    {
        var useMigrations = app.Configuration.GetValue<bool>("Database:UseMigrations");
        var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("DatabaseInitializer");
        const int maxAttempts = 10;

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                using var scope = app.Services.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<LumenXDbContext>();
                if (useMigrations)
                {
                    db.Database.Migrate();
                }
                else
                {
                    db.Database.EnsureCreated();
                }
                return;
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                logger.LogWarning(ex, "Database non pronto (tentativo {Attempt}/{Max}), riprovo tra 2 secondi.", attempt, maxAttempts);
                Thread.Sleep(TimeSpan.FromSeconds(2));
            }
        }
    }
}
