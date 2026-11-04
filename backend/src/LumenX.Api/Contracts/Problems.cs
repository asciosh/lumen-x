namespace LumenX.Api.Contracts;

/// <summary>Risposte di errore uniformi (ProblemDetails).</summary>
public static class Problems
{
    public static IResult BadRequest(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status400BadRequest, title: "Richiesta non valida");

    public static IResult NotFound(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status404NotFound, title: "Non trovato");

    public static IResult Conflict(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status409Conflict, title: "Conflitto");

    public static IResult Unprocessable(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status422UnprocessableEntity, title: "Dati non validi");

    public static IResult BadGateway(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status502BadGateway, title: "Errore dal servizio di forecasting");

    public static IResult ServiceUnavailable(string detail) =>
        Results.Problem(detail: detail, statusCode: StatusCodes.Status503ServiceUnavailable, title: "Servizio di forecasting non disponibile");
}
