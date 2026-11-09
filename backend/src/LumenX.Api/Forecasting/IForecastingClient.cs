namespace LumenX.Api.Forecasting;

public interface IForecastingClient
{
    /// <exception cref="ForecastingInputException">HTTP 422 from the service.</exception>
    /// <exception cref="ForecastingUnavailableException">Service unreachable / timeout.</exception>
    /// <exception cref="ForecastingFailedException">Other errors from the service.</exception>
    Task<ForecastingResponse> ForecastAsync(ForecastingRequest request, CancellationToken cancellationToken = default);
}
