# Lumen-X · Dashboard (Blazor Server)

Dashboard web per prodotti, vendite (import CSV) e forecast. Parla solo con il backend (`backend/`),
mai direttamente con il servizio Python.

## Avvio con Docker Compose (dalla root del repo)

```bash
docker compose up --build
```

- Dashboard: porta **8081** (nel Codespace: scheda *Porte* → apri la 8081)
- Backend: porta 8080 · Forecasting: porta 8000

## Avvio in sviluppo (senza container per la dashboard)

Con backend e servizi già attivi (`docker compose up -d db forecasting backend`):

```bash
cd dashboard/src/LumenX.Dashboard
dotnet run --urls http://0.0.0.0:8081
```

L'URL del backend è in `appsettings.json` (`Backend:BaseUrl`, default `http://localhost:8080`);
si può sovrascrivere con la variabile d'ambiente `Backend__BaseUrl`.

## Versione di .NET

Un solo punto: `dashboard/Directory.Build.props` (`PackagesMajor`, default 10). I Dockerfile usano
l'argomento `DOTNET_MAJOR` (compose: variabile `DOTNET_MAJOR`, default 10). Va tenuto allineato con `backend/`.

## Struttura

- `Services/` client tipizzato verso il backend (`ILumenApiClient`), DTO, formattazione
- `Components/Pages/Products.razor` elenco e creazione prodotti
- `Components/Pages/ProductDetail.razor` import CSV, vendite con filtro, forecast
- `Components/ForecastChart.razor` grafico SVG (storico + previsione + intervallo)

## Test

```bash
dotnet test dashboard/tests/LumenX.Dashboard.Tests
```

I test usano [bUnit](https://bunit.dev) (serie 2.x, supporta .NET 10) per disegnare le pagine in memoria e controllarne il contenuto, con un finto `ILumenApiClient` al posto del backend: nessuna rete, nessun Docker.
Coprono la pagina dei prodotti, la pagina del prodotto (vendite, forecast, spiegazione e relative note, riordino), il grafico, il client HTTP (indirizzi, errori, timeout) e la formattazione.
Non coprono l'aspetto grafico (colori, posizione degli elementi) né il caricamento di un CSV: per quelli resta la prova a mano.

