namespace LumenX.Api.Forecasting;

public class ForecastingException : Exception
{
    public ForecastingException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>The Python service answered 422: the data sent is not acceptable.</summary>
public sealed class ForecastingInputException : ForecastingException
{
    public ForecastingInputException(string message) : base(message)
    {
    }
}

/// <summary>Service unreachable or timeout.</summary>
public sealed class ForecastingUnavailableException : ForecastingException
{
    public ForecastingUnavailableException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}

/// <summary>The service answered with an error other than 422 (e.g. 500) or with an unusable response.</summary>
public sealed class ForecastingFailedException : ForecastingException
{
    public ForecastingFailedException(string message, Exception? inner = null) : base(message, inner)
    {
    }
}
