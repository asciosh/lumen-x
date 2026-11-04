namespace LumenX.Api.Forecasting;

public interface IForecastingClient
{
    /// <exception cref="ForecastingInputException">HTTP 422 dal servizio.</exception>
    /// <exception cref="ForecastingUnavailableException">Servizio non raggiungibile / timeout.</exception>
    /// <exception cref="ForecastingFailedException">Altri errori dal servizio.</exception>
    Task<ForecastingResponse> ForecastAsync(ForecastingRequest request, CancellationToken cancellationToken = default);
}
