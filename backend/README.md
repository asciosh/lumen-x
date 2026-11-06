# Lumen-X · Backend (.NET)

API minimal ASP.NET Core che gestisce prodotti e vendite, chiama il servizio di forecasting Python
(`services/forecasting`) e salva i risultati in PostgreSQL.

```
CSV / API  ->  backend .NET (questa cartella)  ->  servizio Python (FastAPI)
                    |
                PostgreSQL
```

> **Stato:** il codice è stato scritto senza poter eseguire `dotnet build` né `dotnet test`.
> I test vanno eseguiti nel Codespace (vedi sotto).

## Struttura

```
backend/
  Directory.Build.props        versione framework + pacchetti (un solo punto)
  Dockerfile
  scripts/generate_sample_csv.py
  src/LumenX.Api/              API (Domain, Data, Sales, Forecasting, Endpoints, Contracts)
  tests/LumenX.Api.Tests/      xUnit + WebApplicationFactory + DB InMemory + fake del client
```

## Versione di .NET

Controlla l'SDK: `dotnet --list-sdks`.

- **.NET 8 (default):** non serve cambiare nulla.
- **.NET 10:** cambia `PackagesMajor` in `Directory.Build.props` (8 -> 10) e, per Docker, usa
  `DOTNET_MAJOR=10` (es. in un file `.env` nella root: `DOTNET_MAJOR=10`).
  Nei Dockerfile la versione viene forzata anche in `restore`/`publish`, quindi l'immagine non può
  compilare con una versione diversa da quella dei tag `sdk:`/`aspnet:`.

I pacchetti Microsoft/Npgsql usano la versione flottante `<major>.0.*` (ultima patch disponibile).

## Build e test (Codespace)

```bash
cd backend
dotnet build src/LumenX.Api
dotnet test tests/LumenX.Api.Tests
```

I test non usano né Postgres né il servizio Python. Attenzione: il provider InMemory **non applica**
l'indice unico `(prodotto, data)`; l'upsert è garantito dal codice e testato, il vincolo reale
esiste solo su Postgres.

## Avvio con Docker Compose (dalla root del repo)

```bash
docker compose up --build
```

Servizi: `db` (Postgres 16, porta solo su 127.0.0.1), `forecasting` (8000), `backend` (8080).
Password di sviluppo: `lumenx_dev_password`; per cambiarla: `POSTGRES_PASSWORD=... docker compose up --build`
(se il volume `lumenx_pgdata` esiste già, la password precedente resta nel DB: `docker compose down -v`).

## Avvio locale senza Docker

Servono Postgres e il servizio Python già attivi:

```bash
cd backend/src/LumenX.Api
export ConnectionStrings__Default="Host=localhost;Port=5432;Database=lumenx;Username=lumenx;Password=<la tua password>"
export Forecasting__BaseUrl="http://localhost:8000"
ASPNETCORE_URLS=http://localhost:8080 dotnet run
```

## Configurazione

| Chiave (variabile d'ambiente)            | Default                      | Note                                           |
|------------------------------------------|------------------------------|------------------------------------------------|
| `ConnectionStrings__Default`             | localhost, senza password    | la password si passa dall'ambiente              |
| `Forecasting__BaseUrl`                   | `http://localhost:8000`      |                                                |
| `Forecasting__TimeoutSeconds`            | `120`                        |                                                |
| `Database__UseMigrations`                | `false`                      | `false` = `EnsureCreated`, `true` = `Migrate`   |

## Endpoint

| Metodo | Percorso                                  | Descrizione                                              |
|--------|-------------------------------------------|----------------------------------------------------------|
| GET    | `/health`                                 | `{"status":"ok"}`                                        |
| POST   | `/products`                               | crea prodotto `{"name": "...", "sku": "..."}` -> 201     |
| GET    | `/products`                               | elenco prodotti                                          |
| GET    | `/products/{id}`                          | dettaglio prodotto                                       |
| POST   | `/products/{id}/sales/import`             | import CSV (multipart, campo `file`)                     |
| GET    | `/products/{id}/sales?from=&to=`          | vendite, filtro opzionale (date `yyyy-MM-dd`, estremi inclusi) |
| POST   | `/products/{id}/forecast`                 | calcola e salva un forecast -> 201                       |
| GET    | `/products/{id}/forecast`                 | ultimo forecast salvato                                  |

JSON in **camelCase** (convenzione ASP.NET; il servizio Python parla snake_case ma il client lo traduce).

### Import CSV

- Colonne obbligatorie (header, maiuscole/minuscole indifferenti): `date`, `quantity`. Altre colonne ignorate.
- Separatore `,` oppure `;` (deciso dall'header).
- Date: `yyyy-MM-dd` o `dd/MM/yyyy`.
- Quantità: punto o virgola decimale (`12.5`, `12,5`). Con separatore `,` i decimali con virgola vanno tra
  virgolette (`"12,5"`); una riga con colonne in eccesso viene rifiutata, non letta male.
  `1.234,56` e `1,234.56` valgono 1234.56; un solo punto è sempre decimale (`1.234` = 1.234).
- Quantità negative rifiutate.
- Righe errate: riportate in `errors` (con numero di riga, max 100) senza bloccare le valide.
- Upsert per `(prodotto, data)`; se la stessa data compare due volte nel file vince l'ultima riga.
- Risposta: `totalRows, validRows, inserted, updated, duplicatesInFile, rejected, errors, errorsTruncated`.

### Forecast

Body JSON opzionale: `{"horizon": 1..90, "method": "auto"|"naive"|"ets"|"lightgbm"}`.
**Invia sempre almeno `{}`** con `Content-Type: application/json`.

| Situazione                                        | Risposta |
|---------------------------------------------------|----------|
| prodotto inesistente                              | 404      |
| `horizon`/`method` non validi                     | 422      |
| meno di 42 giorni di vendite (servizio NON chiamato) | 422   |
| il servizio Python risponde 422                   | 422      |
| servizio non raggiungibile / timeout              | 503      |
| il servizio risponde con altri errori (es. 500)   | 502      |

## Esempi curl

```bash
BASE=http://localhost:8080

curl $BASE/health

# crea un prodotto
curl -X POST $BASE/products -H "Content-Type: application/json" \
     -d '{"name":"Pane","sku":"PANE-01"}'

# genera un CSV di prova (120 giorni) e importalo (prodotto id 1)
python3 backend/scripts/generate_sample_csv.py --out sample_sales.csv
curl -X POST $BASE/products/1/sales/import -F "file=@sample_sales.csv"

# stile italiano e con 2 righe errate
python3 backend/scripts/generate_sample_csv.py --style italian --with-errors --out sample_it.csv
curl -X POST $BASE/products/1/sales/import -F "file=@sample_it.csv"

# leggi le vendite (filtro opzionale)
curl "$BASE/products/1/sales?from=2025-02-01&to=2025-02-10"

# forecast (default: horizon 28, method auto)
curl -X POST $BASE/products/1/forecast -H "Content-Type: application/json" -d '{}'
curl -X POST $BASE/products/1/forecast -H "Content-Type: application/json" \
     -d '{"horizon":14,"method":"ets"}'

# ultimo forecast salvato
curl $BASE/products/1/forecast
```

## Migrazioni EF (opzionale, da fare nel Codespace)

All'avvio il DB viene creato con `EnsureCreated`. Quando vuoi passare alle migrazioni:

```bash
dotnet tool install --global dotnet-ef --version "8.*"      # con .NET 10: "10.*"
cd backend
dotnet ef migrations add InitialCreate --project src/LumenX.Api --output-dir Data/Migrations
```

Poi imposta `Database__UseMigrations=true` (compose: `DB_USE_MIGRATIONS=true`).
Un DB creato con `EnsureCreated` **non** può essere migrato in seguito: ricrealo
(`docker compose down -v`, che cancella i dati) oppure parti da un DB vuoto.

## Limiti noti

- Nessuna autenticazione.
- Nessuna pagina Swagger per ora (evita dipendenze legate alla versione di .NET).
- Il campo `interval` della risposta Python viene salvato come JSON grezzo (non ne assumo il tipo).

## Spiegazioni del forecast (italiano / inglese)

`GET /products/{id}/forecast/explanation?lang=it|en&useAi=true|false` spiega l'ultimo forecast del prodotto.

1. Il codice calcola i **fatti** (variazione rispetto allo storico recente, giorno più forte, ampiezza dell'intervallo, errore del backtest rispetto al metodo naive, giorni mancanti).
2. Con `useAi=false` il testo viene composto da modelli di frase: gratis, offline, senza AI.
3. Con `useAi=true` (default) e una chiave configurata, **Gemini riscrive** gli stessi fatti in modo più naturale. All'AI vanno solo i fatti aggregati, non le vendite grezze, e le è vietato fare nuovi calcoli.
4. Se la chiave manca o Gemini non risponde (limiti, rete), la risposta contiene il testo a modello e `note` vale `ai_not_configured` o `ai_unavailable`. Se il testo di Gemini contiene cifre che non sono tra i fatti calcolati, viene scartato (`ai_rejected`): l'AI racconta i numeri, non li inventa. Se almeno il 20% dei giorni dello storico è a zero, la spiegazione avverte che la previsione è poco affidabile.

```bash
BASE=http://localhost:8080
curl "$BASE/products/1/forecast/explanation?lang=it&useAi=false"
curl "$BASE/products/1/forecast/explanation?lang=en"
```

### Configurare Gemini (facoltativo)

La chiave non va mai scritta nel codice né in `appsettings.json`: arriva dalla variabile d'ambiente `GEMINI_API_KEY`
(in un Codespace: *Settings → Codespaces → Secrets*, poi riavvia il Codespace). `docker-compose.yml` la passa al backend.
Il modello si cambia con `GEMINI_MODEL` (default `gemini-3.5-flash`): i nomi disponibili cambiano, controllali in Google AI Studio.

Nota: con il piano gratuito Google può usare i contenuti inviati per migliorare i propri prodotti, e i limiti di richieste sono bassi.
Va bene per dati di prova; non usarlo con dati reali di clienti.

## Suggerimenti di riordino

`GET /products/{id}/reorder?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=300` risponde alla domanda "quanto ordinare?" a partire dall'ultimo forecast salvato (tutti i parametri sono facoltativi; i valori indicati sono i default, tranne `onHand`).

- `leadTimeDays`: giorni di consegna del fornitore (1-60)
- `reviewDays`: giorni tra un ordine e l'altro (0-60)
- `serviceLevel`: 90, 95, 98 o 99 (probabilità di non restare senza merce nel periodo)
- `onHand`: scorta attuale; se manca, la risposta non contiene `suggestedOrder`

Il calcolo, con P = `leadTimeDays` + `reviewDays`:

| Voce | Formula |
| --- | --- |
| Domanda nel periodo | somma delle previsioni dei primi P giorni |
| Scorta di sicurezza | z × RMSE giornaliero del backtest × √P |
| Livello massimo | domanda + scorta di sicurezza |
| Ordine suggerito | livello massimo − `onHand`, mai negativo, arrotondato per eccesso |

con z = 1,2816 / 1,6449 / 2,0537 / 2,3263 per il 90 / 95 / 98 / 99%.

Limiti: la radice di P presuppone errori indipendenti da un giorno all'altro, quindi se le vendite cambiano livello di colpo la scorta può risultare scarsa. Se il periodo supera l'orizzonte del forecast la risposta è 422 (ricalcola con un orizzonte più lungo). Se almeno il 20% dei giorni dello storico è a zero, la risposta contiene l'avviso `intermittent`.

```bash
curl "http://localhost:8080/products/1/reorder?leadTimeDays=7&reviewDays=7&serviceLevel=95&onHand=300"
```

