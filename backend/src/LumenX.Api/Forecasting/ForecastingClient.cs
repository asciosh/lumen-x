using System.Net;
using System.Net.Http.Json;
using System.Text.Json;

namespace LumenX.Api.Forecasting;

public sealed class ForecastingClient : IForecastingClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private readonly HttpClient _http;
    private readonly ILogger<ForecastingClient> _logger;

    public ForecastingClient(HttpClient http, ILogger<ForecastingClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<ForecastingResponse> ForecastAsync(
        ForecastingRequest request, CancellationToken cancellationToken = default)
    {
        HttpResponseMessage response;
        try
        {
            response = await _http.PostAsJsonAsync("forecast", request, JsonOptions, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogWarning(ex, "Forecasting service unreachable.");
            throw new ForecastingUnavailableException("The forecasting service is unreachable.", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Timeout calling the forecasting service.");
            throw new ForecastingUnavailableException("The forecasting service did not answer in time.", ex);
        }

        using (response)
        {
            if (response.StatusCode == HttpStatusCode.UnprocessableEntity)
            {
                var body = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new ForecastingInputException(Truncate(body, 500));
            }

            if (!response.IsSuccessStatusCode)
            {
                throw new ForecastingFailedException(
                    $"The forecasting service answered with HTTP {(int)response.StatusCode}.");
            }

            ForecastingResponse? result;
            try
            {
                result = await response.Content.ReadFromJsonAsync<ForecastingResponse>(JsonOptions, cancellationToken);
            }
            catch (JsonException ex)
            {
                throw new ForecastingFailedException("The forecasting service response could not be read.", ex);
            }

            if (result is null || result.Forecast is null || result.Forecast.Count == 0)
            {
                throw new ForecastingFailedException("The forecasting service returned an empty response.");
            }

            return result;
        }
    }

    private static string Truncate(string value, int max) =>
        value.Length <= max ? value : value.Substring(0, max);
}
