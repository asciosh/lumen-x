namespace LumenX.Api.Domain;

public class Product
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Sku { get; set; }
    public DateTime CreatedAtUtc { get; set; }
}

public class SalesRecord
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public DateOnly Date { get; set; }
    public double Quantity { get; set; }
}

public class ForecastRun
{
    public int Id { get; set; }
    public int ProductId { get; set; }
    public DateTime CreatedAtUtc { get; set; }

    /// <summary>Metodo richiesto dal client (null = non specificato).</summary>
    public string? MethodRequested { get; set; }

    public string MethodUsed { get; set; } = string.Empty;
    public int Horizon { get; set; }
    public int HoldoutDays { get; set; }
    public int FilledMissingDays { get; set; }

    /// <summary>Campo "interval" della risposta Python, salvato come JSON grezzo (il tipo non è fissato qui).</summary>
    public string? IntervalJson { get; set; }

    /// <summary>Campo "backtest" della risposta Python, salvato come JSON.</summary>
    public string? BacktestJson { get; set; }

    public List<ForecastPoint> Points { get; set; } = new();
}

public class ForecastPoint
{
    public int Id { get; set; }
    public int ForecastRunId { get; set; }
    public DateOnly Date { get; set; }
    public double Yhat { get; set; }
    public double Lower { get; set; }
    public double Upper { get; set; }
}
