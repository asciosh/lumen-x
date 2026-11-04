namespace LumenX.Api.Forecasting;

public class ForecastingException : Exception
{
    public ForecastingException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>Il servizio Python ha risposto 422: i dati inviati non vanno bene.</summary>
public sealed class ForecastingInputException : ForecastingException
{
    public ForecastingInputException(string message) : base(message)
    {
    }
}

/// <summary>Servizio non raggiungibile o timeout.</summary>
public sealed class ForecastingUnavailableException : ForecastingException
{
    public ForecastingUnavailableException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>Il servizio ha risposto con un errore diverso da 422 (es. 500) o con una risposta inutilizzabile.</summary>
public sealed class ForecastingFailedException : ForecastingException
{
    public ForecastingFailedException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}
