/* Lumen-X, Cloudflare edition: the dashboard. No framework: plain JavaScript that talks to the API of the Worker.
   Everything that comes from the user or from the server is escaped before it goes into the page. */
(function () {
  'use strict';

  var TEXT = {
    en: {
      tagline: 'Sales forecasting', loading: 'Loading…',
      signIn: 'Sign in with GitHub', signOut: 'Sign out',
      signedOutTitle: 'Sign in',
      demoLink: 'No invitation? See the public demo (example data, no sign-in).',
      signedOutText: 'Lumen-X is in private beta. Sign in with your GitHub account: only the people invited by the owner can enter.',
      forbidden: 'This GitHub account is not allowed to use the app. Ask the owner to add it.',
      notConfigured: 'The login is not configured yet.',
      generic: 'Something went wrong. Try again.',
      yourProducts: 'Your products', noProducts: 'You have no products yet. Create one, then import its daily sales from a CSV file.',
      newProduct: 'New product', name: 'Name', sku: 'SKU (optional)', create: 'Create',
      limitNote: function (n) { return 'Up to ' + n + ' products.'; },
      allProducts: '← All products', deleteProduct: 'Delete product',
      confirmDelete: function (name) { return 'Delete "' + name + '" with all its sales and forecasts? This cannot be undone.'; },
      salesTitle: 'Sales', noSales: 'No sales yet. Import a CSV file to start.',
      salesSummary: function (n, from, to) { return n + ' days of sales, from ' + from + ' to ' + to + '.'; },
      importTitle: 'Import sales from a CSV file',
      importHelp: 'The file needs a header with the columns "date" and "quantity". Dates like 2025-01-31 or 31/01/2025; quantities with a dot or a comma as decimal. If a date is already there, the new quantity replaces it. Other columns are ignored. Up to 5,000 rows and 1 MB per file.',
      formatTitle: 'What the file looks like', importButton: 'Import', importing: 'Importing…', chooseFile: 'Choose a CSV file first.',
      imported: function (i, u) { return 'Imported: ' + i + ' new days, ' + u + ' updated.'; },
      dupes: function (n) { return n + ' repeated dates in the file: the last one was used.'; },
      skipped: function (n) { return n + ' rows were skipped:'; },
      line: 'Line', problem: 'Problem', moreProblems: 'More problems are not listed.',
      forecastTitle: 'Forecast', horizon: 'Days to forecast', method: 'Method', methodAuto: 'Auto (the best on the backtest)',
      compute: 'Compute forecast', computing: 'Computing…',
      lead: function (d, t, a) { return 'Next ' + d + ' days: about <strong>' + t + '</strong> units, ' + a + ' per day.'; },
      history: 'History', forecastWord: 'Forecast', range: 'Likely range (min–max)',
      chartNote: function (n) { return 'The last ' + n + ' days of history and the forecast for the days that follow.'; },
      methodUsed: 'Method', horizonLabel: 'Horizon', checkedOn: 'Checked on', daysN: function (n) { return n + ' days'; },
      filled: function (n) { return n + ' missing days in the history were filled in by interpolation.'; },
      noForecast: 'No forecast yet. Import the sales, then compute it.',
      reliable: 'How reliable is it', reliableNote: 'Average error on days the model had not seen: lower is better. The method used is highlighted.',
      reorderTitle: 'Reorder', reorderNote: 'How much to order so you do not run out of stock until the next delivery.',
      leadTime: 'Days for delivery', reviewDays: 'Days between orders', serviceLevel: 'Service level', onHand: 'Current stock (optional)', calculate: 'Calculate',
      rPeriod: 'Period to cover', rDemand: 'Expected demand in the period', rSafety: function (p) { return 'Safety stock (' + p + '%)'; }, rLevel: 'Maximum level', rOrder: 'Suggested order',
      intermittent: 'This product often sells nothing for whole days: its forecast and this suggestion are less reliable.',
      footer: 'Lumen-X · Cloudflare edition · private beta',
      explanationTitle: 'Explanation', explanationSource: 'Written by the app from the numbers above (no AI).',
      askTitle: 'Ask your data', askNote: 'Questions about this product\'s sales and forecast, answered by the app with fixed rules (no AI): it only uses your numbers.',
      askLabel: 'Your question', askPlaceholder: 'For example: How much did I sell in the last 30 days?', askButton: 'Ask', asking: 'Thinking…',
      sampleLink: 'Download an example file (240 days)',
      privacyTitle: 'Privacy',
      privacy: ['What is stored: the products you create, their daily sales and forecasts, the numeric id of your GitHub account (to know whose they are) and how many AI rewrites you did today (a counter kept for a few days). Not your email, and no analytics or tracking.',
        'Where: in a database of Cloudflare, the service this app runs on. Each account only sees its own data in the app, but the owner of this beta runs the database and could technically read it: upload only data you are comfortable sharing.',
        'AI: only if you press "Rewrite with AI", and only when the owner has switched it on. Then only summary numbers are sent, never your sales rows and never the product name, to the providers listed here after you sign in. The result is checked so that it has no figures that are not in your data. Up to 20 rewrites a day. Everything else (explanations, answers) is written by the app itself.',
        'Cookies: only the one that keeps you signed in (14 days) and a short one used during the sign-in.',
        'Deleting: you can delete a product from its page, or everything with the button below. Cloudflare may keep automatic database backups for a few days.'],
      deleteAll: 'Delete all my data', confirmDeleteAll: 'Delete ALL your products, sales and forecasts? This cannot be undone.', deletedAll: 'All your data was deleted.',
      salesDaily: 'Sales day by day', from: 'From', to: 'To', apply: 'Apply', clear: 'Clear', date: 'Date', quantity: 'Quantity',
      noSalesInPeriod: 'No sales in this period.',
      showingLast: function (n) { return 'Showing the last ' + n + ' days.'; },
      showingFirst: function (n, total) { return 'Showing ' + n + ' of ' + total + ' days (the most recent first).'; },
      downloadSales: 'Download sales (CSV)', downloadForecast: 'Download forecast (CSV)',
      forecastDaily: 'Forecast day by day', minCol: 'Min', maxCol: 'Max',
      daysFilled: 'Days filled in', interval: 'Interval', computedOn: 'Computed on',
      intervalText: function (level) { return 'about ' + Math.round(level * 100) + '% of the days should fall in the range'; },
      exampleTitle: 'Try it with example data', exampleText: 'Creates a product with 240 days of invented sales and computes its forecast, so you can see everything working.',
      exampleButton: 'Create an example product', exampleName: 'Example', creatingExample: 'Creating…',
      aiButton: 'Rewrite with AI', aiWorking: 'Writing…', aiOriginal: 'Show the text written by the app',
      aiLeft: function (n) { return n + (n === 1 ? ' rewrite' : ' rewrites') + ' left today'; },
      aiSource: function (label) { return 'Rewritten by AI (' + label + ') from the numbers above, without your product name. The figures were checked against your data.'; },
      aiNote_ai_not_configured: 'The AI is not available right now: this is the text written by the app.',
      aiNote_ai_unavailable: 'The AI providers did not answer: this is the text written by the app.',
      aiNote_ai_rejected: 'The AI wrote figures that are not in your data, so its text was discarded: this is the text written by the app.',
      aiProviders: function (names) { return 'AI providers set up by the owner: ' + names + '.'; },
      summaryTitle: 'At a glance', chartTitle: 'How sales will go',
      orderTitle: 'How much to order', orderKickerOrder: 'Order about', orderKickerNeed: 'You need about', unitsWord: 'units',
      orderSubNeed: function (d) { return 'between stock and orders, for the next ' + d + ' days'; },
      orderSubOrder: function (total, d, have) { return 'You need ' + total + ' between stock and orders for the next ' + d + ' days, and you already have ' + have + '.'; },
      onHandAsk: 'How many do you already have in stock?', updateButton: 'Update',
      orderAssumptions: function (lead, review, level) { return 'Worked out for a delivery in ' + lead + ' days and an order every ' + review + ' days, with a ' + level + ' safety margin.'; },
      orderSettings: 'Change delivery times and safety margin', leadDays: 'Days for the delivery', reviewDaysLabel: 'Days between one order and the next', safetyLabel: 'Safety margin',
      sl90: 'Economic: you may run out about 1 time in 10', sl95: 'Normal: about 1 time in 20', sl98: 'Careful: about 1 time in 50', sl99: 'Very careful: about 1 time in 100',
      slName90: 'economic', slName95: 'normal', slName98: 'careful', slName99: 'very careful',
      orderNumbers: 'The numbers behind it',
      orderTooShort: function (p) { return 'To work out the order the forecast must cover at least ' + p + ' days. Recompute it from "Details for experts".'; },
      sellTitle: 'How much will I sell', sellKicker: function (d) { return 'In the next ' + d + ' days'; }, sellPerDay: function (a) { return 'that is ' + a + ' a day'; },
      sellSame: function (n) { return 'In line with the last ' + n + ' days.'; },
      sellMore: function (p, n) { return p + '% more than the last ' + n + ' days.'; }, sellLess: function (p, n) { return p + '% less than the last ' + n + ' days.'; },
      sellDays: function (a, b) { return 'Best day: ' + a + '. Weakest: ' + b + '.'; },
      trustTitle: 'How much can I trust it',
      trust_high: 'Very reliable', trust_medium: 'Fairly reliable', trust_low: 'Not very reliable', trust_very_low: 'Not reliable',
      trustError: function (units, pct) { return 'Tested on days it had not seen, it was off by about ' + units + ' units a day on average (' + pct + '% of the sales).'; },
      trustNaive: 'It does no better than simply repeating last week.', trustZero: 'Many days have no sales at all, so the numbers are hard to predict.', trustCaution: 'Use the forecast with caution.',
      expertTitle: 'Details for experts', expertHint: 'Methods, errors, day-by-day tables, the full explanation, downloads and your sales.',
      uploadTitle: 'Upload your sales', uploadText: 'Choose a file with one row per day: the date and how many you sold. From Excel: Save as CSV.',
      computeNow: 'Work out the forecast', needMoreDays: function (n) { return 'A forecast needs at least 42 days of sales: you have ' + n + '. Upload more.'; },
      forecastUpdated: 'The forecast was updated.', productName: 'Product name', createGo: 'Create and continue',
      startHere: 'Start here: try the example, or add your own product.'
    },
    it: {
      tagline: 'Previsione vendite', loading: 'Caricamento…',
      signIn: 'Accedi con GitHub', signOut: 'Esci',
      signedOutTitle: 'Accedi',
      demoLink: 'Non hai un invito? Guarda la demo pubblica (dati d\'esempio, senza accedere).',
      signedOutText: 'Lumen-X è in beta privata. Accedi con il tuo account GitHub: possono entrare solo le persone invitate dal proprietario.',
      forbidden: 'Questo account GitHub non può usare l\'app. Chiedi al proprietario di aggiungerlo.',
      notConfigured: 'Il login non è ancora configurato.',
      generic: 'Qualcosa è andato storto. Riprova.',
      yourProducts: 'I tuoi prodotti', noProducts: 'Non hai ancora prodotti. Creane uno, poi importa le sue vendite giornaliere da un file CSV.',
      newProduct: 'Nuovo prodotto', name: 'Nome', sku: 'SKU (facoltativo)', create: 'Crea',
      limitNote: function (n) { return 'Fino a ' + n + ' prodotti.'; },
      allProducts: '← Tutti i prodotti', deleteProduct: 'Elimina prodotto',
      confirmDelete: function (name) { return 'Eliminare "' + name + '" con tutte le sue vendite e previsioni? Non si può annullare.'; },
      salesTitle: 'Vendite', noSales: 'Ancora nessuna vendita. Importa un file CSV per cominciare.',
      salesSummary: function (n, from, to) { return n + ' giorni di vendite, dal ' + from + ' al ' + to + '.'; },
      importTitle: 'Importa le vendite da un file CSV',
      importHelp: 'Il file deve avere un\'intestazione con le colonne "date" e "quantity". Date come 2025-01-31 o 31/01/2025; quantità con il punto o la virgola come decimale. Se una data c\'è già, la nuova quantità la sostituisce. Le altre colonne vengono ignorate. Fino a 5.000 righe e 1 MB per file.',
      formatTitle: 'Com\'è fatto il file', importButton: 'Importa', importing: 'Importazione…', chooseFile: 'Scegli prima un file CSV.',
      imported: function (i, u) { return 'Importati: ' + i + ' giorni nuovi, ' + u + ' aggiornati.'; },
      dupes: function (n) { return n + ' date ripetute nel file: è stata usata l\'ultima.'; },
      skipped: function (n) { return n + ' righe sono state saltate:'; },
      line: 'Riga', problem: 'Problema', moreProblems: 'Altri problemi non sono elencati.',
      forecastTitle: 'Previsione', horizon: 'Giorni da prevedere', method: 'Metodo', methodAuto: 'Auto (il migliore nel backtest)',
      compute: 'Calcola previsione', computing: 'Calcolo…',
      lead: function (d, t, a) { return 'Prossimi ' + d + ' giorni: circa <strong>' + t + '</strong> unità, ' + a + ' al giorno.'; },
      history: 'Storico', forecastWord: 'Previsione', range: 'Intervallo probabile (min–max)',
      chartNote: function (n) { return 'Gli ultimi ' + n + ' giorni di storico e la previsione per i giorni successivi.'; },
      methodUsed: 'Metodo', horizonLabel: 'Orizzonte', checkedOn: 'Verificato su', daysN: function (n) { return n + ' giorni'; },
      filled: function (n) { return n + ' giorni mancanti nello storico sono stati riempiti per interpolazione.'; },
      noForecast: 'Ancora nessuna previsione. Importa le vendite, poi calcolala.',
      reliable: 'Quanto è affidabile', reliableNote: 'Errore medio sui giorni che il modello non aveva visto: più basso è meglio. Il metodo usato è evidenziato.',
      reorderTitle: 'Riordino', reorderNote: 'Quanto ordinare per non restare senza merce fino alla prossima consegna.',
      leadTime: 'Giorni di consegna', reviewDays: 'Giorni tra un ordine e l\'altro', serviceLevel: 'Livello di servizio', onHand: 'Scorta attuale (facoltativa)', calculate: 'Calcola',
      rPeriod: 'Periodo da coprire', rDemand: 'Domanda prevista nel periodo', rSafety: function (p) { return 'Scorta di sicurezza (' + p + '%)'; }, rLevel: 'Livello massimo', rOrder: 'Ordine suggerito',
      intermittent: 'Questo prodotto spesso non vende niente per giorni interi: la sua previsione e questo suggerimento sono meno affidabili.',
      footer: 'Lumen-X · edizione Cloudflare · beta privata',
      explanationTitle: 'Spiegazione', explanationSource: 'Scritta dall\'app a partire dai numeri qui sopra (senza AI).',
      askTitle: 'Chiedi ai tuoi dati', askNote: 'Domande sulle vendite e sulla previsione di questo prodotto, a cui l\'app risponde con regole fisse (senza AI): usa solo i tuoi numeri.',
      askLabel: 'La tua domanda', askPlaceholder: 'Per esempio: Quanto ho venduto negli ultimi 30 giorni?', askButton: 'Chiedi', asking: 'Sto pensando…',
      sampleLink: 'Scarica un file d\'esempio (240 giorni)',
      privacyTitle: 'Privacy',
      privacy: ['Cosa viene salvato: i prodotti che crei, le loro vendite giornaliere e le previsioni, l\'id numerico del tuo account GitHub (per sapere di chi sono) e quante riscritture con AI hai fatto oggi (un contatore tenuto per qualche giorno). Non la tua email, e nessuna analisi o tracciamento.',
        'Dove: in un database di Cloudflare, il servizio su cui gira questa app. Ogni account vede nell\'app solo i propri dati, ma chi gestisce questa beta amministra il database e potrebbe tecnicamente leggerlo: carica solo dati che ti va di condividere.',
        'AI: solo se premi "Riscrivi con AI", e solo quando chi gestisce l\'app l\'ha attivata. Allora vengono inviati solo numeri riassuntivi, mai le righe delle vendite e mai il nome del prodotto, ai fornitori elencati qui dopo l\'accesso. Il risultato viene controllato perché non contenga cifre che non sono nei tuoi dati. Fino a 20 riscritture al giorno. Tutto il resto (spiegazioni, risposte) lo scrive l\'app stessa.',
        'Cookie: solo quello che ti tiene collegato (14 giorni) e uno breve usato durante l\'accesso.',
        'Cancellazione: puoi eliminare un prodotto dalla sua pagina, o tutto con il pulsante qui sotto. Cloudflare può conservare per qualche giorno copie di sicurezza automatiche del database.'],
      deleteAll: 'Cancella tutti i miei dati', confirmDeleteAll: 'Cancellare TUTTI i tuoi prodotti, vendite e previsioni? Non si può annullare.', deletedAll: 'Tutti i tuoi dati sono stati cancellati.',
      salesDaily: 'Vendite giorno per giorno', from: 'Dal', to: 'Al', apply: 'Applica', clear: 'Azzera', date: 'Data', quantity: 'Quantità',
      noSalesInPeriod: 'Nessuna vendita in questo periodo.',
      showingLast: function (n) { return 'Mostro gli ultimi ' + n + ' giorni.'; },
      showingFirst: function (n, total) { return 'Mostro ' + n + ' giorni su ' + total + ' (i più recenti per primi).'; },
      downloadSales: 'Scarica le vendite (CSV)', downloadForecast: 'Scarica la previsione (CSV)',
      forecastDaily: 'Previsione giorno per giorno', minCol: 'Min', maxCol: 'Max',
      daysFilled: 'Giorni riempiti', interval: 'Intervallo', computedOn: 'Calcolata il',
      intervalText: function (level) { return 'circa il ' + Math.round(level * 100) + '% dei giorni dovrebbe cadere nella fascia'; },
      exampleTitle: 'Provala con dati d\'esempio', exampleText: 'Crea un prodotto con 240 giorni di vendite inventate e ne calcola la previsione, così vedi tutto in funzione.',
      exampleButton: 'Crea un prodotto d\'esempio', exampleName: 'Esempio', creatingExample: 'Creo…',
      aiButton: 'Riscrivi con AI', aiWorking: 'Scrivo…', aiOriginal: 'Mostra il testo scritto dall\'app',
      aiLeft: function (n) { return n + (n === 1 ? ' riscrittura rimasta' : ' riscritture rimaste') + ' oggi'; },
      aiSource: function (label) { return 'Riscritta dall\'AI (' + label + ') a partire dai numeri qui sopra, senza il nome del prodotto. Le cifre sono state controllate sui tuoi dati.'; },
      aiNote_ai_not_configured: 'L\'AI non è disponibile in questo momento: questo è il testo scritto dall\'app.',
      aiNote_ai_unavailable: 'I fornitori di AI non hanno risposto: questo è il testo scritto dall\'app.',
      aiNote_ai_rejected: 'L\'AI ha scritto cifre che non sono nei tuoi dati, quindi il suo testo è stato scartato: questo è il testo scritto dall\'app.',
      aiProviders: function (names) { return 'Fornitori di AI configurati da chi gestisce l\'app: ' + names + '.'; },
      summaryTitle: 'In breve', chartTitle: 'Come andranno le vendite',
      orderTitle: 'Quanto ordinare', orderKickerOrder: 'Ordina circa', orderKickerNeed: 'Ti servono circa', unitsWord: 'unità',
      orderSubNeed: function (d) { return 'tra magazzino e ordini, per i prossimi ' + d + ' giorni'; },
      orderSubOrder: function (total, d, have) { return 'Ti servono ' + total + ' tra magazzino e ordini per i prossimi ' + d + ' giorni, e ne hai già ' + have + '.'; },
      onHandAsk: 'Quante ne hai già in magazzino?', updateButton: 'Aggiorna',
      orderAssumptions: function (lead, review, level) { return 'Calcolato per una consegna in ' + lead + ' giorni e un ordine ogni ' + review + ' giorni, con un margine di sicurezza ' + level + '.'; },
      orderSettings: 'Cambia tempi di consegna e margine di sicurezza', leadDays: 'Giorni per la consegna', reviewDaysLabel: 'Giorni tra un ordine e l\'altro', safetyLabel: 'Margine di sicurezza',
      sl90: 'Economico: puoi restare senza merce circa 1 volta su 10', sl95: 'Normale: circa 1 volta su 20', sl98: 'Prudente: circa 1 volta su 50', sl99: 'Molto prudente: circa 1 volta su 100',
      slName90: 'economico', slName95: 'normale', slName98: 'prudente', slName99: 'molto prudente',
      orderNumbers: 'I numeri del calcolo',
      orderTooShort: function (p) { return 'Per calcolare l\'ordine la previsione deve coprire almeno ' + p + ' giorni. Ricalcolala da "Dettagli per esperti".'; },
      sellTitle: 'Quanto venderò', sellKicker: function (d) { return 'Nei prossimi ' + d + ' giorni'; }, sellPerDay: function (a) { return 'cioè ' + a + ' al giorno'; },
      sellSame: function (n) { return 'In linea con gli ultimi ' + n + ' giorni.'; },
      sellMore: function (p, n) { return 'Il ' + p + '% in più rispetto agli ultimi ' + n + ' giorni.'; }, sellLess: function (p, n) { return 'Il ' + p + '% in meno rispetto agli ultimi ' + n + ' giorni.'; },
      sellDays: function (a, b) { return 'Giorno più forte: ' + a + '. Più debole: ' + b + '.'; },
      trustTitle: 'Quanto posso fidarmi',
      trust_high: 'Molto affidabile', trust_medium: 'Abbastanza affidabile', trust_low: 'Poco affidabile', trust_very_low: 'Non affidabile',
      trustError: function (units, pct) { return 'Provata su giorni che non conosceva, ha sbagliato in media di circa ' + units + ' unità al giorno (' + pct + '% delle vendite).'; },
      trustNaive: 'Non fa meglio che ripetere la settimana scorsa.', trustZero: 'Molti giorni non hanno vendite, quindi i numeri sono difficili da prevedere.', trustCaution: 'Usa la previsione con cautela.',
      expertTitle: 'Dettagli per esperti', expertHint: 'Metodi, errori, tabelle giorno per giorno, spiegazione completa, scarichi e le tue vendite.',
      uploadTitle: 'Carica le tue vendite', uploadText: 'Scegli un file con una riga per ogni giorno: la data e quante unità hai venduto. Da Excel: Salva con nome, formato CSV.',
      computeNow: 'Calcola la previsione', needMoreDays: function (n) { return 'Per una previsione servono almeno 42 giorni di vendite: ne hai ' + n + '. Carica altri dati.'; },
      forecastUpdated: 'La previsione è stata aggiornata.', productName: 'Nome del prodotto', createGo: 'Crea e continua',
      startHere: 'Parti da qui: prova l\'esempio, oppure aggiungi il tuo prodotto.'
    }
  };

  // The public demo (GitHub Pages): real outputs of the full app on example data, readable without signing in.
  var DEMO_URL = 'https://asciosh.github.io/lumen-x/';

  var SAMPLE = 'date,quantity\n2025-01-01,12\n2025-01-02,15\n2025-01-03,9\n…';

  // Example questions the app is sure to understand (the same as the engine: a test keeps them equal).
  var EXAMPLES = {
    en: ['How much did I sell in the last 30 days?', 'How are sales doing compared to last month?', 'Which day of the week sells best?', 'How much will I sell in the next 2 weeks?', 'What should I order?', 'How reliable is the forecast?', 'Explain the forecast', 'What was my record day?'],
    it: ['Quanto ho venduto negli ultimi 30 giorni?', 'Come vanno le vendite rispetto al mese scorso?', 'Qual è il giorno più forte della settimana?', 'Quanto prevedo di vendere nelle prossime 2 settimane?', 'Cosa conviene ordinare?', 'Quanto è affidabile la previsione?', 'Spiegami la previsione', 'Qual è stato il giorno record?']
  };

  var state = { lang: initialLang(), user: null, ai: null };

  function initialLang() {
    try { var saved = localStorage.getItem('lumenx_lang'); if (saved === 'it' || saved === 'en') return saved; } catch (e) { /* storage can be blocked */ }
    return /^it/i.test(navigator.language || '') ? 'it' : 'en';
  }
  function el(id) { return document.getElementById(id); }
  function t(key) { return TEXT[state.lang][key]; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function setContent(html) { el('content').innerHTML = html; }

  // Same separators as the other dashboards (never dependent on the browser's language)
  function num(v, d) {
    var neg = v < 0, s = Math.abs(v).toFixed(d), parts = s.split('.');
    var grp = state.lang === 'it' ? '.' : ',', dec = state.lang === 'it' ? ',' : '.';
    var int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, grp);
    var out = parts.length > 1 ? int + dec + parts[1] : int;
    return (neg && Number(s) !== 0 ? '-' : '') + out;
  }
  function qty(v) { return num(v, Math.abs(v) >= 100 ? 0 : 1); }
  function dayNumber(iso) { var p = iso.split('-'); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86400000); }
  function pad(x) { return (x < 10 ? '0' : '') + x; }
  function shortDate(dn) { var d = new Date(dn * 86400000); return pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) + '/' + pad(d.getUTCFullYear() % 100); }
  function fullDate(iso) { var p = iso.split('-'); return state.lang === 'it' ? p[2] + '/' + p[1] + '/' + p[0] : (+p[2]) + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] + ' ' + p[0]; }
  function n2(v) { return String(Math.round(v * 100) / 100); }
  function fmtDateTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    var day = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return fullDate(day) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function download(filename, text) {
    var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    var a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- talking to the API ----------
  function api(method, path, body) {
    var init = { method: method, headers: {} };
    if (body instanceof FormData) { init.body = body; }
    else if (body !== undefined) { init.body = JSON.stringify(body); init.headers['content-type'] = 'application/json'; }
    return fetch(path, init).then(function (r) {
      return r.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        return { status: r.status, ok: r.ok, data: data };
      });
    });
  }
  function problemText(res) { return (res.data && (res.data.detail || res.data.title)) || t('generic'); }
  function alertHtml(kind, html) { return '<div class="alert alert-' + kind + '" role="' + (kind === 'error' ? 'alert' : 'status') + '">' + html + '</div>'; }
  function sessionLost(res) {
    if (res.status === 401) { showSignedOut(); return true; }
    if (res.status === 403 && res.data && res.data.title === 'Forbidden' && /not allowed/i.test(res.data.detail || '')) { showForbidden(); return true; }
    return false;
  }

  // ---------- chart (the same as the demo) ----------
  function niceScale(lo, hi) {
    var range = hi - lo; if (range <= 0) range = Math.max(1, Math.abs(hi));
    var rough = range * 1.06 / 4, mag = Math.pow(10, Math.floor(Math.log10(rough))), frac = rough / mag;
    var step = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10) * mag;
    var min = Math.floor((lo - range * 0.03) / step) * step; if (lo >= 0 && min < 0) min = 0;
    var max = Math.ceil((hi + range * 0.03) / step) * step; if (max <= min) max = min + step;
    return { min: min, max: max, step: step };
  }

  function chartSvg(sales, fc, maxHist) {
    var W = 800, H = 340, L = 72, R = 18, T = 18, B = 38;
    var hist = sales.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (hist.length > maxHist) hist = hist.slice(hist.length - maxHist);
    var days = hist.map(function (p) { return dayNumber(p.date); }).concat(fc.map(function (p) { return dayNumber(p.date); }));
    if (!days.length) return '';
    var x0 = Math.min.apply(null, days), x1 = Math.max.apply(null, days), span = Math.max(1, x1 - x0);
    var vals = hist.map(function (p) { return p.quantity; });
    fc.forEach(function (p) { vals.push(p.yhat, p.lower, p.upper); });
    var sc = niceScale(Math.min.apply(null, vals), Math.max.apply(null, vals));
    function X(d) { return L + (d - x0) / span * (W - L - R); }
    function Y(v) { return T + (1 - (v - sc.min) / (sc.max - sc.min)) * (H - T - B); }
    function pt(iso, v) { return n2(X(dayNumber(iso))) + ',' + n2(Y(v)); }

    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="chart" role="img" aria-label="' + esc(t('forecastTitle')) + '">';
    s += '<defs><linearGradient id="lx-band" x1="0" y1="0" x2="0" y2="1"><stop class="band-top" offset="0"/><stop class="band-bottom" offset="1"/></linearGradient></defs>';
    var dec = sc.step >= 1 ? 0 : (sc.step >= 0.1 ? 1 : 2), count = Math.round((sc.max - sc.min) / sc.step);
    for (var i = 0; i <= count; i++) {
      var v = sc.min + i * sc.step, y = Y(v);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + n2(y) + '" y2="' + n2(y) + '" class="grid"/>';
      s += '<text x="' + (L - 10) + '" y="' + n2(y + 4) + '" text-anchor="end" class="tick">' + num(v, dec) + '</text>';
    }
    for (var k = 0; k <= 4; k++) {
      var dn = Math.round(x0 + span * k / 4), a = k === 4 ? 'end' : (k === 0 ? 'start' : 'middle');
      s += '<text x="' + n2(X(dn)) + '" y="' + (H - 12) + '" text-anchor="' + a + '" class="tick">' + shortDate(dn) + '</text>';
    }
    if (fc.length) {
      var up = fc.map(function (p) { return pt(p.date, p.upper); });
      var lo = fc.slice().reverse().map(function (p) { return pt(p.date, p.lower); });
      s += '<polygon points="' + up.concat(lo).join(' ') + '" class="band"/>';
    }
    if (hist.length && fc.length) { var sx = n2(X(dayNumber(hist[hist.length - 1].date))); s += '<line x1="' + sx + '" x2="' + sx + '" y1="' + T + '" y2="' + (H - B) + '" class="split"/>'; }
    if (hist.length) s += '<polyline points="' + hist.map(function (p) { return pt(p.date, p.quantity); }).join(' ') + '" pathLength="1" class="line-history"/>';
    if (fc.length) s += '<polyline points="' + fc.map(function (p) { return pt(p.date, p.yhat); }).join(' ') + '" class="line-yhat"/>';
    if (hist.length && fc.length) { var last = hist[hist.length - 1]; s += '<circle cx="' + n2(X(dayNumber(last.date))) + '" cy="' + n2(Y(last.quantity)) + '" r="4.6" class="dot"/>'; }
    // Invisible points with a tooltip: hover a day to read its value
    hist.forEach(function (p) { s += '<circle class="hit" cx="' + n2(X(dayNumber(p.date))) + '" cy="' + n2(Y(p.quantity)) + '" r="5"><title>' + esc(fullDate(p.date) + ': ' + qty(p.quantity)) + '</title></circle>'; });
    fc.forEach(function (p) { s += '<circle class="hit" cx="' + n2(X(dayNumber(p.date))) + '" cy="' + n2(Y(p.yhat)) + '" r="5"><title>' + esc(fullDate(p.date) + ': ' + qty(p.yhat) + ' (' + qty(p.lower) + '–' + qty(p.upper) + ')') + '</title></circle>'; });
    return s + '</svg>';
  }

  // ---------- header and states without a session ----------
  function paintChrome() {
    document.documentElement.lang = state.lang;
    el('tagline').textContent = t('tagline');
    el('footer').textContent = t('footer');
    el('btn-en').className = state.lang === 'en' ? 'on' : '';
    el('btn-it').className = state.lang === 'it' ? 'on' : '';
    el('signout').textContent = t('signOut');
    el('who').hidden = !state.user;
    el('signout').hidden = !state.user;
    if (state.user) el('who').textContent = '@' + state.user;
  }

  function privacyHtml(withDelete) {
    var lines = t('privacy').slice();
    if (state.ai && state.ai.enabled) lines.push(t('aiProviders')(state.ai.providers.map(function (p) { return p.label; }).join(', ')));
    return '<details class="fold"><summary><h3 style="margin:0">' + esc(t('privacyTitle')) + '</h3></summary><ul class="hint">' +
      lines.map(function (line) { return '<li>' + esc(line) + '</li>'; }).join('') + '</ul>' +
      (withDelete ? '<p><button class="btn btn-secondary danger" type="button" id="delete-all">' + esc(t('deleteAll')) + '</button></p>' : '') + '</details>';
  }

  function showSignedOut() {
    state.user = null; paintChrome();
    setContent('<section class="card"><h2>' + esc(t('signedOutTitle')) + '</h2><p class="muted hint">' + esc(t('signedOutText')) + '</p><p><a class="btn btn-link" href="/auth/login">' + esc(t('signIn')) + '</a></p>' +
      '<p class="muted"><a href="' + DEMO_URL + '" rel="noopener">' + esc(t('demoLink')) + '</a></p>' + privacyHtml() + '</section>');
  }
  function showForbidden() {
    state.user = null; paintChrome();
    setContent('<section class="card"><h2>' + esc(t('signedOutTitle')) + '</h2>' + alertHtml('error', esc(t('forbidden'))) + '<p><button class="btn btn-secondary" type="button" id="forbidden-out">' + esc(t('signOut')) + '</button></p></section>');
    el('forbidden-out').addEventListener('click', signOut);
  }
  function showNotConfigured() {
    state.user = null; paintChrome();
    setContent('<section class="card">' + alertHtml('error', esc(t('notConfigured'))) + '</section>');
  }
  function signOut() { api('POST', '/auth/logout').then(function () { location.hash = '#/'; location.reload(); }); }

  // ---------- the list of products ----------
  var MAX_PRODUCTS = 10;

  // Every change of page gets a number: an answer that arrives after the user went elsewhere must not draw the old page on top.
  var navigation = 0;

  function showList(flashHtml) {
    var token = ++navigation;
    setContent('<p class="muted">' + esc(t('loading')) + '</p>');
    api('GET', '/api/products').then(function (res) {
      if (token !== navigation) return;
      if (sessionLost(res)) return;
      if (!res.ok) { setContent(alertHtml('error', esc(problemText(res)))); return; }
      var list = res.data || [];
      var html = '<h1>' + esc(t('yourProducts')) + '</h1>' + (flashHtml || '');
      if (list.length === 0) {
        html += '<p class="muted hint">' + esc(t('startHere')) + '</p>';
      } else {
        html += '<ul class="product-list">' + list.map(function (p) {
          return '<li><a href="#/p/' + p.id + '"><span>' + esc(p.name) + '</span><span class="meta">' + esc(p.sku || '') + '</span></a></li>';
        }).join('') + '</ul>';
      }
      var newCard = '<section class="card"><h2>' + esc(t('newProduct')) + '</h2><form id="new-product"><div class="row">' +
        '<label>' + esc(t('productName')) + '<input type="text" name="name" maxlength="100" required></label>' +
        '<button class="btn" type="submit">' + esc(t('createGo')) + '</button></div>' +
        '<p class="muted">' + esc(t('limitNote')(MAX_PRODUCTS)) + '</p><div id="new-product-msg"></div></form></section>';
      var exampleCard = '<section class="card"><h2>' + esc(t('exampleTitle')) + '</h2><p class="muted hint">' + esc(t('exampleText')) + '</p><p><button class="btn btn-secondary" type="button" id="example-product">' + esc(t('exampleButton')) + '</button></p><div id="example-msg"></div></section>';
      html += list.length === 0 ? exampleCard + newCard : newCard + exampleCard;   // nothing yet: the example comes first
      html += '<section class="card">' + privacyHtml(true) + '</section>';   // the delete button is inside the notice: not the first thing a newcomer sees
      setContent(html);
      el('example-product').addEventListener('click', createExample);
      el('delete-all').addEventListener('click', function () {
        if (!window.confirm(t('confirmDeleteAll'))) return;
        api('DELETE', '/api/me/data').then(function (r) {
          if (sessionLost(r)) return;
          if (r.status === 204) { showList(alertHtml('ok', esc(t('deletedAll')))); return; }
          el('new-product-msg').innerHTML = alertHtml('error', esc(problemText(r)));
        });
      });
      el('new-product').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var form = ev.target;
        api('POST', '/api/products', { name: form.name.value }).then(function (r) {
          if (sessionLost(r)) return;
          if (r.status === 201) { location.hash = '#/p/' + r.data.id; return; }
          el('new-product-msg').innerHTML = alertHtml('error', esc(problemText(r)));
        });
      });
    });
  }

  // ---------- one product ----------
  var view = null; // what the product page is showing right now

  function showProduct(id, flashHtml) {
    var token = ++navigation;
    setContent('<p class="muted">' + esc(t('loading')) + '</p>');
    Promise.all([api('GET', '/api/products/' + id), api('GET', '/api/products/' + id + '/sales'), api('GET', '/api/products/' + id + '/forecast')]).then(function (r) {
      if (token !== navigation) return;
      for (var i = 0; i < r.length; i++) if (sessionLost(r[i])) return;
      if (r[0].status === 404) { location.hash = '#/'; return; }
      if (!r[0].ok) { setContent(alertHtml('error', esc(problemText(r[0])))); return; }
      view = { id: id, product: r[0].data, sales: (r[1].data || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), forecast: r[2].ok ? r[2].data : null };
      renderProduct(flashHtml || '');
    });
  }

  var WEEKDAYS_IT = { Monday: 'lunedì', Tuesday: 'martedì', Wednesday: 'mercoledì', Thursday: 'giovedì', Friday: 'venerdì', Saturday: 'sabato', Sunday: 'domenica' };
  function weekdayName(english) { return state.lang === 'it' ? (WEEKDAYS_IT[english] || english) : english; }
  function percentText(v) { return num(Math.abs(v), Math.abs(v) >= 10 ? 0 : 1); }

  // The import form, once: in the main card while there are no sales, in the expert details afterwards
  function importFormHtml() {
    return '<p class="muted hint">' + esc(t('importHelp')) + '</p>' +
      '<details class="fold"><summary><h3 style="margin:0">' + esc(t('formatTitle')) + '</h3></summary><pre><code>' + esc(SAMPLE) + '</code></pre><p><a href="sample-sales.csv" download>' + esc(t('sampleLink')) + '</a></p></details>' +
      '<form id="import-form"><div class="row"><label>CSV<input type="file" name="file" accept=".csv,text/csv,text/plain"></label>' +
      '<button class="btn" type="submit" id="import-button">' + esc(t('importButton')) + '</button></div><div id="import-msg"></div></form>';
  }

  function summaryShellHtml() {
    var levels = [90, 95, 98, 99].map(function (l) { return '<option value="' + l + '"' + (l === 95 ? ' selected' : '') + '>' + esc(t('sl' + l)) + '</option>'; }).join('');
    return '<div class="summary-grid">' +
      '<div class="block order"><h3>' + esc(t('orderTitle')) + '</h3><div id="order-result"><p class="muted">' + esc(t('loading')) + '</p></div>' +
        '<form id="order-form" class="row"><label>' + esc(t('onHandAsk')) + '<input type="number" name="onhand" min="0" step="any"></label><button class="btn btn-secondary btn-small" type="submit">' + esc(t('updateButton')) + '</button></form>' +
        '<details class="fold" id="order-settings"><summary><h3 style="margin:0">' + esc(t('orderSettings')) + '</h3></summary>' +
          '<div class="row"><label>' + esc(t('leadDays')) + '<input type="number" id="order-lead" min="1" max="60" value="7"></label>' +
          '<label>' + esc(t('reviewDaysLabel')) + '<input type="number" id="order-review" min="0" max="60" value="7"></label>' +
          '<label>' + esc(t('safetyLabel')) + '<select id="order-level">' + levels + '</select></label>' +
          '<button class="btn btn-secondary btn-small" type="button" id="order-apply">' + esc(t('calculate')) + '</button></div>' +
          '<div id="order-numbers"></div></details></div>' +
      '<div class="block sell"><h3>' + esc(t('sellTitle')) + '</h3><div id="sell-result"></div></div>' +
      '<div class="block trust"><h3>' + esc(t('trustTitle')) + '</h3><div id="trust-result"></div></div></div>';
  }

  function renderProduct(flashHtml) {
    var p = view.product, sales = view.sales, hasForecast = !!view.forecast;
    var html = '<p class="crumb"><a href="#/">' + esc(t('allProducts')) + '</a></p>' +
      '<div class="title-row"><h1>' + esc(p.name) + '</h1>' + (p.sku ? '<p class="muted sku">' + esc(p.sku) + '</p>' : '') + '</div><div id="flash">' + flashHtml + '</div>';

    if (!sales.length) {
      // nothing to show yet: the one thing to do is to load the sales
      html += '<section class="card stage"><h2>' + esc(t('uploadTitle')) + '</h2><p class="muted hint">' + esc(t('uploadText')) + '</p>' + importFormHtml() + '</section>';
    } else {
      // 1) the answers
      html += '<section class="card stage" id="summary-card"><h2>' + esc(t('summaryTitle')) + '</h2>';
      if (hasForecast) html += summaryShellHtml();
      else if (sales.length >= 42) html += '<p><button class="btn" type="button" id="compute-now">' + esc(t('computeNow')) + '</button></p><div id="forecast-msg"></div>';
      else html += '<p class="muted">' + esc(t('needMoreDays')(sales.length)) + '</p>';
      html += '</section>';
      // 2) the chart
      if (hasForecast) html += '<section class="card" id="chart-card"><h2>' + esc(t('chartTitle')) + '</h2><div id="chart-box"></div></section>';
    }

    // 3) questions about the data
    html += '<section class="card chat"><h2>' + esc(t('askTitle')) + '</h2><p class="muted">' + esc(t('askNote')) + '</p>' +
      '<form class="ask" id="ask-form"><label>' + esc(t('askLabel')) + '<input type="text" id="ask-input" maxlength="300" autocomplete="off" placeholder="' + esc(t('askPlaceholder')) + '"></label>' +
      '<button class="btn" type="submit" id="ask-button">' + esc(t('askButton')) + '</button></form>' +
      '<div class="chips" id="chips">' + EXAMPLES[state.lang].map(function (q, i) { return '<button type="button" class="chip" data-i="' + i + '">' + esc(q) + '</button>'; }).join('') + '</div>' +
      '<div id="ask-msg"></div><div id="turns"></div></section>';

    // 4) everything technical, folded
    if (sales.length) {
      html += '<section class="card"><details class="fold expert" id="expert"><summary><h2 style="margin:0">' + esc(t('expertTitle')) + '</h2></summary><p class="muted hint">' + esc(t('expertHint')) + '</p>' +
        '<h3>' + esc(t('forecastTitle')) + '</h3>' +
        '<form id="forecast-form"><div class="row">' +
        '<label>' + esc(t('horizon')) + '<input type="number" name="horizon" min="1" max="90" value="28"></label>' +
        '<label>' + esc(t('method')) + '<select name="method"><option value="auto">' + esc(t('methodAuto')) + '</option><option value="ets">ETS</option><option value="naive">naive</option></select></label>' +
        '<button class="btn" type="submit" id="forecast-button">' + esc(t('compute')) + '</button></div><div id="forecast-msg-expert"></div></form>' +
        '<div id="forecast-result"></div>' +
        '<h3>' + esc(t('salesTitle')) + '</h3>' +
        '<p>' + esc(t('salesSummary')(num(sales.length, 0), fullDate(sales[0].date), fullDate(sales[sales.length - 1].date))) + '</p>' +
        '<p><button class="btn btn-secondary btn-small" type="button" id="sales-download">' + esc(t('downloadSales')) + '</button></p>' +
        '<details class="fold" id="sales-fold"><summary><h3 style="margin:0">' + esc(t('salesDaily')) + '</h3></summary>' +
        '<div class="row"><label>' + esc(t('from')) + '<input type="date" id="sales-from"></label><label>' + esc(t('to')) + '<input type="date" id="sales-to"></label>' +
        '<button class="btn btn-secondary" type="button" id="sales-apply">' + esc(t('apply')) + '</button><button class="btn btn-secondary" type="button" id="sales-clear">' + esc(t('clear')) + '</button></div><div id="sales-table"></div></details>' +
        '<h3>' + esc(t('importTitle')) + '</h3>' + importFormHtml() + '</details></section>';
    }

    html += '<p><button class="btn btn-secondary danger" type="button" id="delete-product">' + esc(t('deleteProduct')) + '</button></p>';
    setContent(html);
    view.turns = [];

    if (el('import-form')) el('import-form').addEventListener('submit', onImport);
    if (el('forecast-form')) el('forecast-form').addEventListener('submit', onForecast);
    if (el('compute-now')) el('compute-now').addEventListener('click', function () { computeForecast(28, 'auto', el('forecast-msg'), el('compute-now')); });
    if (el('order-form')) {
      el('order-form').addEventListener('submit', function (ev) { ev.preventDefault(); loadSummary(); });
      el('order-apply').addEventListener('click', loadSummary);
    }
    el('delete-product').addEventListener('click', onDelete);
    if (el('sales-fold')) {
      el('sales-apply').addEventListener('click', paintSalesTable);
      el('sales-clear').addEventListener('click', function () { el('sales-from').value = ''; el('sales-to').value = ''; paintSalesTable(); });
      el('sales-download').addEventListener('click', function () { download(LumenExport.fileName(view.product.name, 'sales'), LumenExport.salesCsv(view.sales)); });
      paintSalesTable();
    }
    el('ask-form').addEventListener('submit', function (ev) { ev.preventDefault(); askQuestion(el('ask-input').value); });
    el('chips').addEventListener('click', function (ev) { var b = ev.target.closest ? ev.target.closest('.chip') : null; if (b) askQuestion(EXAMPLES[state.lang][+b.getAttribute('data-i')]); });
    if (hasForecast) paintForecast();
  }

  // ---------- questions about the data ----------
  function renderTurns() {
    var box = el('turns'); box.textContent = '';
    view.turns.forEach(function (turn) {
      var d = document.createElement('div'); d.className = 'turn';
      var q = document.createElement('p'); q.className = 'q'; q.textContent = turn.q;   // always as text
      var a = document.createElement('p'); a.className = 'a'; a.textContent = turn.a;
      d.appendChild(q); d.appendChild(a); box.appendChild(d);
    });
  }

  function askQuestion(text) {
    var question = String(text || '').trim();
    if (question.length === 0) return;
    var button = el('ask-button'), chips = el('chips').querySelectorAll('.chip');
    function busy(on) { button.disabled = on; button.textContent = on ? t('asking') : t('askButton'); chips.forEach(function (c) { c.disabled = on; }); }
    busy(true); el('ask-msg').innerHTML = '';
    api('POST', '/api/products/' + view.id + '/ask', { question: question, language: state.lang }).then(function (res) {
      busy(false);
      if (sessionLost(res)) return;
      if (!res.ok) { el('ask-msg').innerHTML = alertHtml('error', esc(problemText(res))); return; }
      view.turns.unshift({ q: question, a: res.data.answer });
      if (view.turns.length > 8) view.turns.pop();
      el('ask-input').value = '';
      renderTurns();
    });
  }

  var SALES_ROWS_SHOWN = 15, SALES_ROWS_MAX = 200;
  function paintSalesTable() {
    var from = el('sales-from').value, to = el('sales-to').value, box = el('sales-table');
    var rows = view.sales.filter(function (r) { return (!from || r.date >= from) && (!to || r.date <= to); }).reverse();   // newest first
    var filtered = !!(from || to), shown = rows.slice(0, filtered ? SALES_ROWS_MAX : SALES_ROWS_SHOWN);
    if (rows.length === 0) { box.innerHTML = '<p class="muted">' + esc(t('noSalesInPeriod')) + '</p>'; return; }
    box.innerHTML = '<div class="scroll"><table class="table"><thead><tr><th>' + esc(t('date')) + '</th><th class="num">' + esc(t('quantity')) + '</th></tr></thead><tbody>' +
      shown.map(function (r) { return '<tr><td>' + esc(fullDate(r.date)) + '</td><td class="num">' + qty(r.quantity) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<p class="muted">' + esc(rows.length > shown.length ? t('showingFirst')(shown.length, num(rows.length, 0)) : (filtered ? '' : t('showingLast')(shown.length))) + '</p>';
  }

  // One click: a product with the example file, and its forecast
  function createExample() {
    var button = el('example-product'), msg = el('example-msg');
    button.disabled = true; button.textContent = t('creatingExample'); msg.innerHTML = '';
    function fail(res) { button.disabled = false; button.textContent = t('exampleButton'); if (!sessionLost(res)) msg.innerHTML = alertHtml('error', esc(problemText(res))); }
    function create(n) {
      var name = t('exampleName') + (n > 1 ? ' ' + n : '');
      return api('POST', '/api/products', { name: name }).then(function (res) { return res.status === 409 && n < 5 ? create(n + 1) : res; });
    }
    create(1).then(function (res) {
      if (res.status !== 201) { fail(res); return; }
      var id = res.data.id;
      fetch('sample-sales.csv').then(function (r) { return r.blob(); }).then(function (blob) {
        var fd = new FormData(); fd.append('file', blob, 'sample-sales.csv');
        return api('POST', '/api/products/' + id + '/sales/import', fd);
      }).then(function (imp) {
        if (!imp.ok) { fail(imp); return; }
        return api('POST', '/api/products/' + id + '/forecast', { horizon: 28 }).then(function (fc) {
          if (fc.status !== 201) { fail(fc); return; }
          location.hash = '#/p/' + id;
        });
      }).catch(function () { fail({ status: 0, data: null }); });
    });
  }

  function onImport(ev) {
    ev.preventDefault();
    var file = ev.target.file.files[0], msg = el('import-msg');
    if (!file) { msg.innerHTML = alertHtml('error', esc(t('chooseFile'))); return; }
    var fd = new FormData(); fd.append('file', file);
    var button = el('import-button'); button.disabled = true; button.textContent = t('importing');
    api('POST', '/api/products/' + view.id + '/sales/import', fd).then(function (res) {
      if (sessionLost(res)) return;
      button.disabled = false; button.textContent = t('importButton');
      if (!res.ok) {
        var extra = res.data && res.data.errors && res.data.errors.length ? errorsTable(res.data.errors, res.data.errorsTruncated) : '';
        msg.innerHTML = alertHtml('error', esc(problemText(res))) + extra;
        return;
      }
      var d = res.data, html = alertHtml('ok', esc(t('imported')(num(d.inserted, 0), num(d.updated, 0))) + (d.duplicatesInFile ? ' ' + esc(t('dupes')(d.duplicatesInFile)) : ''));
      if (d.rejected) html += alertHtml('warn', esc(t('skipped')(d.rejected))) + errorsTable(d.errors, d.errorsTruncated);
      // The forecast follows by itself: nobody should have to know that it has to be asked for.
      api('POST', '/api/products/' + view.id + '/forecast', { horizon: 28, method: 'auto' }).then(function (fc) {
        if (sessionLost(fc)) return;
        html += fc.status === 201 ? alertHtml('ok', esc(t('forecastUpdated'))) : alertHtml('warn', esc(problemText(fc)));
        showProduct(view.id, html);
      });
    });
  }

  function errorsTable(errors, truncated) {
    if (!errors || !errors.length) return '';
    var rows = errors.slice(0, 10).map(function (e) { return '<tr><td class="num">' + esc(e.line) + '</td><td>' + esc(e.message) + '</td></tr>'; }).join('');
    return '<div class="scroll"><table class="table"><thead><tr><th>' + esc(t('line')) + '</th><th>' + esc(t('problem')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (truncated || errors.length > 10 ? '<p class="muted">' + esc(t('moreProblems')) + '</p>' : '');
  }

  // Computes a forecast and shows it (shared by the button of the summary and the form of the expert details)
  function computeForecast(horizon, method, msgBox, button) {
    var label = button ? button.textContent : '';
    if (button) { button.disabled = true; button.textContent = t('computing'); }
    if (msgBox) msgBox.innerHTML = '';
    api('POST', '/api/products/' + view.id + '/forecast', { horizon: horizon, method: method }).then(function (res) {
      if (sessionLost(res)) return;
      if (button) { button.disabled = false; button.textContent = label; }
      if (res.status === 201) {
        view.forecast = res.data;
        if (el('chart-box')) paintForecast(); else showProduct(view.id);   // the first forecast needs the whole page
        return;
      }
      if (msgBox) msgBox.innerHTML = alertHtml('error', esc(problemText(res)));
    });
  }

  function onForecast(ev) {
    ev.preventDefault();
    var form = ev.target;
    computeForecast(Number(form.horizon.value), form.method.value, el('forecast-msg-expert'), el('forecast-button'));
  }

  function paintForecast() {
    var f = view.forecast;
    if (!f) return;
    var fc = f.forecast;
    // the chart
    if (el('chart-box')) {
      el('chart-box').innerHTML = '<div class="chart-wrap">' + chartSvg(view.sales, fc, 120) + '</div>' +
        '<div class="legend"><span><i class="sw sw-history"></i> ' + esc(t('history')) + '</span><span><i class="sw sw-yhat"></i> ' + esc(t('forecastWord')) + '</span><span><i class="sw sw-band"></i> ' + esc(t('range')) + '</span></div>' +
        '<p class="muted">' + esc(t('chartNote')(Math.min(120, view.sales.length))) + '</p>';
    }
    // the expert details
    var box = el('forecast-result');
    if (box) {
      var html = '<dl class="facts"><div><dt>' + esc(t('methodUsed')) + '</dt><dd><strong>' + esc(f.methodUsed) + '</strong></dd></div>' +
        '<div><dt>' + esc(t('horizonLabel')) + '</dt><dd>' + esc(t('daysN')(f.horizon)) + '</dd></div>' +
        '<div><dt>' + esc(t('checkedOn')) + '</dt><dd>' + esc(t('daysN')(f.holdoutDays)) + '</dd></div>' +
        '<div><dt>' + esc(t('daysFilled')) + '</dt><dd>' + esc(num(f.filledMissingDays, 0)) + '</dd></div>' +
        '<div><dt>' + esc(t('interval')) + '</dt><dd>' + esc(t('intervalText')(f.intervalLevel)) + '</dd></div>' +
        '<div><dt>' + esc(t('computedOn')) + '</dt><dd>' + esc(fmtDateTime(f.createdAtUtc)) + '</dd></div></dl>';
      if (f.filledMissingDays > 0) html += '<p class="muted">' + esc(t('filled')(f.filledMissingDays)) + '</p>';
      html += '<p><button class="btn btn-secondary btn-small" type="button" id="forecast-download">' + esc(t('downloadForecast')) + '</button></p>';
      html += '<details class="fold"><summary><h3 style="margin:0">' + esc(t('forecastDaily')) + '</h3></summary><div class="scroll"><table class="table"><thead><tr><th>' + esc(t('date')) + '</th><th class="num">' + esc(t('forecastWord')) + '</th><th class="num">' + esc(t('minCol')) + '</th><th class="num">' + esc(t('maxCol')) + '</th></tr></thead><tbody>' +
        fc.map(function (p) { return '<tr><td>' + esc(fullDate(p.date)) + '</td><td class="num">' + qty(p.yhat) + '</td><td class="num">' + qty(p.lower) + '</td><td class="num">' + qty(p.upper) + '</td></tr>'; }).join('') +
        '</tbody></table></div></details>';
      html += '<h3>' + esc(t('explanationTitle')) + '</h3><div class="explanation" id="explanation">' + esc(t('loading')) + '</div><p class="muted source" id="explanation-source">' + esc(t('explanationSource')) + '</p>';
      if (state.ai && state.ai.enabled) {
        html += '<p><button class="btn btn-secondary btn-small" type="button" id="ai-rewrite">' + esc(t('aiButton')) + '</button> <span class="muted" id="ai-left">' + esc(t('aiLeft')(state.ai.remaining)) + '</span></p><div id="ai-note"></div>';
      }
      var names = Object.keys(f.backtest || {});
      if (names.length) {
        html += '<h3>' + esc(t('reliable')) + '</h3><p class="muted">' + esc(t('reliableNote')) + '</p><table class="table narrow"><thead><tr><th></th><th class="num">MAE</th><th class="num">RMSE</th></tr></thead><tbody>';
        names.forEach(function (k) {
          var m = f.backtest[k];
          html += '<tr class="' + (k === f.methodUsed ? 'is-used' : '') + '"><td>' + esc(k) + '</td><td class="num">' + num(m.mae, 2) + '</td><td class="num">' + num(m.rmse, 2) + '</td></tr>';
        });
        html += '</tbody></table>';
      }
      box.innerHTML = html;
      if (el('ai-rewrite')) el('ai-rewrite').addEventListener('click', onAiRewrite);
      el('forecast-download').addEventListener('click', function () { download(LumenExport.fileName(view.product.name, 'forecast'), LumenExport.forecastCsv(f.forecast)); });
      loadExplanation();
    }
    loadSummary();
  }

  // "Rewrite with AI" / "Show the text written by the app": the second press goes back to the original
  function onAiRewrite() {
    var button = el('ai-rewrite'), note = el('ai-note');
    if (view.aiShown) {
      view.aiShown = false; button.textContent = t('aiButton'); note.innerHTML = '';
      el('explanation-source').textContent = t('explanationSource');
      loadExplanation();
      return;
    }
    button.disabled = true; button.textContent = t('aiWorking'); note.innerHTML = '';
    api('POST', '/api/products/' + view.id + '/forecast/explanation/ai?lang=' + state.lang).then(function (res) {
      button.disabled = false; button.textContent = t('aiButton');
      if (sessionLost(res)) return;
      if (!res.ok) { note.innerHTML = alertHtml('error', esc(problemText(res))); if (res.status === 429) { state.ai.remaining = 0; el('ai-left').textContent = t('aiLeft')(0); } return; }
      state.ai.remaining = res.data.remaining; el('ai-left').textContent = t('aiLeft')(res.data.remaining);
      el('explanation').textContent = res.data.text;                // always as text
      if (res.data.source === 'ai') {
        view.aiShown = true; button.textContent = t('aiOriginal');
        el('explanation-source').textContent = t('aiSource')(res.data.providerLabel);
      } else {
        note.innerHTML = alertHtml('warn', esc(t('aiNote_' + res.data.note) || t('generic')));
      }
    });
  }

  function loadExplanation() {
    var id = view.id;
    api('GET', '/api/products/' + id + '/forecast/explanation?lang=' + state.lang).then(function (res) {
      var target = el('explanation');
      if (!target || view.id !== id) return;          // the page changed meanwhile
      if (sessionLost(res)) return;
      if (res.ok) target.textContent = res.data.text; // always as text
      else target.textContent = problemText(res);
    });
  }

  function safetyName(level) { return t('slName' + level) || (level + '%'); }

  // The three answers: how much to order, how much I will sell, how much I can trust it. One request to the server.
  function loadSummary() {
    var id = view.id;
    if (!el('order-result')) return;
    var q = 'leadTimeDays=' + encodeURIComponent(el('order-lead').value) + '&reviewDays=' + encodeURIComponent(el('order-review').value) + '&serviceLevel=' + encodeURIComponent(el('order-level').value);
    var onhand = el('order-form').onhand.value.trim();
    if (onhand !== '') q += '&onHand=' + encodeURIComponent(onhand);
    api('GET', '/api/products/' + id + '/summary?' + q).then(function (res) {
      if (view.id !== id || !el('order-result')) return;   // the page changed meanwhile
      if (sessionLost(res)) return;
      if (!res.ok) { el('order-result').innerHTML = alertHtml('error', esc(problemText(res))); return; }
      paintOrder(res.data); paintSell(res.data); paintTrust(res.data);
    });
  }

  function paintOrder(d) {
    var box = el('order-result'), o = d.order;
    if (!o) {
      var lead = Number(el('order-lead').value) + Number(el('order-review').value);
      box.innerHTML = alertHtml('warn', esc(/horizon/i.test(d.orderError || '') ? t('orderTooShort')(lead) : d.orderError));
      el('order-numbers').innerHTML = '';
      return;
    }
    var ordering = o.suggestedOrder !== null;
    var html = '<p class="kicker">' + esc(ordering ? t('orderKickerOrder') : t('orderKickerNeed')) + '</p>' +
      '<p class="bignum">' + num(ordering ? o.suggestedOrder : o.orderUpToLevel, 0) + ' <span>' + esc(t('unitsWord')) + '</span></p>' +
      '<p class="muted">' + esc(ordering ? t('orderSubOrder')(num(o.orderUpToLevel, 0), o.periodDays, num(o.onHand, 0)) : t('orderSubNeed')(o.periodDays)) + '</p>' +
      '<p class="muted small">' + esc(t('orderAssumptions')(o.leadTimeDays, o.reviewDays, safetyName(o.serviceLevelPercent))) + '</p>';
    box.innerHTML = html;
    el('order-numbers').innerHTML = '<h3>' + esc(t('orderNumbers')) + '</h3><table class="table narrow"><tbody>' +
      '<tr><td>' + esc(t('rPeriod')) + '</td><td class="num">' + esc(t('daysN')(o.periodDays)) + '</td></tr>' +
      '<tr><td>' + esc(t('rDemand')) + '</td><td class="num">' + qty(o.demandInPeriod) + '</td></tr>' +
      '<tr><td>' + esc(t('rSafety')(o.serviceLevelPercent)) + '</td><td class="num">' + qty(o.safetyStock) + '</td></tr>' +
      '<tr><td>' + esc(t('rLevel')) + '</td><td class="num"><strong>' + qty(o.orderUpToLevel) + '</strong></td></tr></tbody></table>';
  }

  function paintSell(d) {
    var s = d.sales, html = '<p class="kicker">' + esc(t('sellKicker')(s.days)) + '</p>' +
      '<p class="bignum">' + num(s.total, 0) + ' <span>' + esc(t('unitsWord')) + '</span></p><p class="muted">' + esc(t('sellPerDay')(num(s.avgPerDay, 0))) + '</p>';
    if (s.changePercent !== null) {
      var c = s.changePercent;
      html += '<p>' + esc(Math.abs(c) < 2 ? t('sellSame')(s.referenceDays) : (c > 0 ? t('sellMore') : t('sellLess'))(percentText(c), s.referenceDays)) + '</p>';
    }
    if (s.strongestWeekday && s.weakestWeekday) html += '<p class="muted">' + esc(t('sellDays')(weekdayName(s.strongestWeekday), weekdayName(s.weakestWeekday))) + '</p>';
    el('sell-result').innerHTML = html;
  }

  function paintTrust(d) {
    var tr = d.trust;
    var html = '<p><span class="badge ' + esc(tr.level) + '">' + esc(t('trust_' + tr.level)) + '</span></p>';
    if (tr.errorPercent !== null) html += '<p>' + esc(t('trustError')(qty(tr.errorUnits), percentText(tr.errorPercent))) + '</p>';
    if (tr.beatsNaive === false) html += '<p class="muted">' + esc(t('trustNaive')) + '</p>';
    if (tr.intermittent) html += '<p class="muted">' + esc(t('trustZero')) + '</p>';
    if (tr.level === 'low' || tr.level === 'very_low') html += '<p class="muted">' + esc(t('trustCaution')) + '</p>';
    el('trust-result').innerHTML = html;
  }

  function onDelete() {
    if (!window.confirm(t('confirmDelete')(view.product.name))) return;
    api('DELETE', '/api/products/' + view.id).then(function (res) {
      if (sessionLost(res)) return;
      if (res.status === 204) { location.hash = '#/'; return; }
      el('flash').innerHTML = alertHtml('error', esc(problemText(res)));
    });
  }

  // ---------- routing and start ----------
  function route() {
    if (!state.user) return;
    var m = /^#\/p\/(\d+)$/.exec(location.hash);
    if (m) showProduct(Number(m[1])); else showList();
  }

  function setLang(lang) {
    state.lang = lang;
    try { localStorage.setItem('lumenx_lang', lang); } catch (e) { /* storage can be blocked */ }
    paintChrome();
    if (state.user) route(); else start();
  }

  function start() {
    paintChrome();
    api('GET', '/api/me').then(function (res) {
      if (res.status === 401) { showSignedOut(); return; }
      if (res.status === 403) { showForbidden(); return; }
      if (res.status === 503) { showNotConfigured(); return; }
      if (!res.ok) { setContent(alertHtml('error', esc(t('generic')))); return; }
      state.user = res.data.login; paintChrome();
      api('GET', '/api/ai').then(function (ai) { state.ai = ai.ok ? ai.data : null; route(); });
    }).catch(function () { setContent(alertHtml('error', esc(t('generic')))); });
  }

  el('btn-en').addEventListener('click', function () { setLang('en'); });
  el('btn-it').addEventListener('click', function () { setLang('it'); });
  el('signout').addEventListener('click', signOut);
  window.addEventListener('hashchange', route);
  start();
})();
