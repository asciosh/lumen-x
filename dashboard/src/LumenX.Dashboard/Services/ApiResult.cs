namespace LumenX.Dashboard.Services;

/// <summary>Outcome of a backend call: a value or a readable error.</summary>
public sealed class ApiResult<T>
{
    private ApiResult(bool isSuccess, T? value, int statusCode, string? error)
    {
        IsSuccess = isSuccess;
        Value = value;
        StatusCode = statusCode;
        Error = error;
    }

    public bool IsSuccess { get; }
    public T? Value { get; }

    /// <summary>HTTP status code; 0 if the backend could not be reached.</summary>
    public int StatusCode { get; }

    /// <summary>The error text (in English); null when the backend gave no detail.</summary>
    public string? Error { get; }

    public static ApiResult<T> Ok(T value) => new(true, value, 200, null);

    public static ApiResult<T> Fail(int statusCode, string? error) => new(false, default, statusCode, error);

    /// <summary>The message in English, with a little context depending on the status code.</summary>
    public string ErrorText => For(LanguageState.English);

    /// <summary>
    /// The message to show to the user in the given language. Our own messages are translated; the detail
    /// that comes from the backend is shown as it is (it is in English).
    /// </summary>
    public string For(string language)
    {
        var message = Error is null ? null : Loc.T(Error, language);
        return StatusCode switch
        {
            422 => Loc.T("Invalid data: {0}", language, message ?? ""),
            503 => Loc.T("{0} (check that the 'forecasting' service is running).", language, message ?? ""),
            502 => Loc.T("Error from the forecasting service: {0}", language, message ?? ""),
            0 => message ?? Loc.T("Backend unreachable.", language),
            _ => message ?? Loc.T("HTTP error {0}.", language, StatusCode)
        };
    }
}
