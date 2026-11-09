using LumenX.Api.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace LumenX.Api.Data;

public class LumenXDbContext : DbContext
{
    public LumenXDbContext(DbContextOptions<LumenXDbContext> options) : base(options)
    {
    }

    public DbSet<Product> Products => Set<Product>();
    public DbSet<SalesRecord> SalesRecords => Set<SalesRecord>();
    public DbSet<ForecastRun> ForecastRuns => Set<ForecastRun>();
    public DbSet<ForecastPoint> ForecastPoints => Set<ForecastPoint>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Product>(e =>
        {
            e.HasKey(p => p.Id);
            e.Property(p => p.Name).IsRequired().HasMaxLength(200);
            e.Property(p => p.Sku).HasMaxLength(100);
            e.HasIndex(p => p.Name).IsUnique();
        });

        modelBuilder.Entity<SalesRecord>(e =>
        {
            e.HasKey(s => s.Id);
            e.HasIndex(s => new { s.ProductId, s.Date }).IsUnique();
            e.HasOne<Product>().WithMany().HasForeignKey(s => s.ProductId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ForecastRun>(e =>
        {
            e.HasKey(r => r.Id);
            e.Property(r => r.MethodUsed).IsRequired().HasMaxLength(50);
            e.Property(r => r.MethodRequested).HasMaxLength(50);
            e.HasIndex(r => r.ProductId);
            e.HasOne<Product>().WithMany().HasForeignKey(r => r.ProductId).OnDelete(DeleteBehavior.Cascade);
            e.HasMany(r => r.Points).WithOne().HasForeignKey(p => p.ForecastRunId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<ForecastPoint>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => p.ForecastRunId);
        });
    }
}

/// <summary>
/// Used only by the "dotnet ef" commands: it stops the tools from starting the whole app
/// (which would try to connect to Postgres). It makes no connection.
/// </summary>
public class LumenXDbContextFactory : IDesignTimeDbContextFactory<LumenXDbContext>
{
    public LumenXDbContext CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<LumenXDbContext>()
            .UseNpgsql("Host=localhost;Database=lumenx;Username=lumenx")
            .Options;
        return new LumenXDbContext(options);
    }
}
