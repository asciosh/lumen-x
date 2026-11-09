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
- Nella pagina del prodotto il riquadro **Chiedi ai tuoi dati** manda le domande a `POST /products/{id}/ask` (vedi `backend/README.md`) e mostra le ultime otto risposte, le più recenti in alto

## Test

```bash
dotnet test dashboard/tests/LumenX.Dashboard.Tests
```

I test usano [bUnit](https://bunit.dev) (serie 2.x, supporta .NET 10) per disegnare le pagine in memoria e controllarne il contenuto, con un finto `ILumenApiClient` al posto del backend: nessuna rete, nessun Docker.
Coprono la pagina dei prodotti, la pagina del prodotto (vendite, forecast, spiegazione e relative note, riordino), il grafico, il client HTTP (indirizzi, errori, timeout) e la formattazione.
Non coprono l'aspetto grafico (colori, posizione degli elementi) né il caricamento di un CSV: per quelli resta la prova a mano.

## Aspetto

Tema scuro "inchiostro e ambra", ripreso dall'immagine di anteprima del repo: sfondo `#0f1117`, testo crema `#fef4e2`, ambra `#fcbb47` come unico colore d'azione e ambra scuro per la fascia d'incertezza.
Il grafico è l'elemento principale: la linea dello storico è piena e luminosa, la previsione è tratteggiata e la fascia probabile le sta dietro; il pallino segna dove finiscono i dati e comincia la previsione.

- Tutti i colori e i caratteri sono variabili in `wwwroot/app.css` (blocco `:root`): per cambiare tema basta modificare lì.
- Caratteri incorporati in `wwwroot/fonts` (nessuna richiesta a servizi esterni): **Bricolage Grotesque** per titoli e numeri, **Figtree** per testo e tabelle. Licenza SIL Open Font License 1.1, testi accanto ai file.
- Il movimento è uno solo: la linea si disegna al primo caricamento. Con "riduci movimento" attivo nel sistema non c'è nessuna animazione.
- La pagina di demo (`docs/demo`) usa la stessa `app.css` e gli stessi caratteri: se cambi la grafica della dashboard, copia di nuovo `app.css` e la cartella `fonts` anche lì.

