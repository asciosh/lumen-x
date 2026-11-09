namespace LumenX.Api.Contracts;

/// <summary>Uniform error responses (ProblemDetails).</summary>
public static class Problems
{
    public static IResult BadRequest(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status400BadRequest, title: "Bad request");

    public static IResult NotFound(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status404NotFound, title: "Not found");

    public static IResult Conflict(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status409Conflict, title: "Conflitto");

    public static IResult Unprocessable(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status422UnprocessableEntity, title: "Invalid data");

    public static IResult BadGateway(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status502BadGateway, title: "Forecasting service error");

    public static IResult ServiceUnavailable(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status503ServiceUnavailable, title: "Forecasting service unavailable");
}
