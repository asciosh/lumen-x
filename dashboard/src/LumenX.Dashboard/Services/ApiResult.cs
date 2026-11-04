namespace LumenX.Dashboard.Services;

/// <summary>Esito di una chiamata al backend: valore oppure errore leggibile.</summary>
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

    /// <summary>Codice HTTP; 0 se il backend non e' stato raggiunto.</summary>
    public int StatusCode { get; }

    public string? Error { get; }

    public static ApiResult<T> Ok(T value) => new(true, value, 200, null);

    public static ApiResult<T> Fail(int statusCode, string error) => new(false, default, statusCode, error);

    /// <summary>Messaggio da mostrare all'utente, con un piccolo contesto in base al codice.</summary>
    public string ErrorText => StatusCode switch
    {
        422 => $"Dati non validi: {Error}",
        503 => $"{Error} (controlla che il servizio 'forecasting' sia attivo).",
        502 => $"Errore dal servizio di forecasting: {Error}",
        0 => Error ?? "Backend non raggiungibile.",
        _ => Error ?? $"Errore HTTP {StatusCode}."
    };
}
