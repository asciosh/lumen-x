/* Lumen-X, Cloudflare edition: the dashboard. No framework: plain JavaScript that talks to the API of the Worker.
   Everything that comes from the user or from the server is escaped before it goes into the page. */
(function () {
  'use strict';

  var TEXT = {
    en: {
      tagline: 'Sales forecasting', loading: 'Loading…',
      signIn: 'Sign in with GitHub', signOut: 'Sign out',
      signedOutTitle: 'Sign in',
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
      footer: 'Lumen-X · Cloudflare edition · private beta'
    },
    it: {
      tagline: 'Previsione vendite', loading: 'Caricamento…',
      signIn: 'Accedi con GitHub', signOut: 'Esci',
      signedOutTitle: 'Accedi',
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
      footer: 'Lumen-X · edizione Cloudflare · beta privata'
    }
  };

  var SAMPLE = 'date,quantity\n2025-01-01,12\n2025-01-02,15\n2025-01-03,9\n…';

  var state = { lang: initialLang(), user: null };

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

  function showSignedOut() {
    state.user = null; paintChrome();
    setContent('<section class="card"><h2>' + esc(t('signedOutTitle')) + '</h2><p class="muted hint">' + esc(t('signedOutText')) + '</p><p><a class="btn btn-link" href="/auth/login">' + esc(t('signIn')) + '</a></p></section>');
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

  function showList() {
    setContent('<p class="muted">' + esc(t('loading')) + '</p>');
    api('GET', '/api/products').then(function (res) {
      if (sessionLost(res)) return;
      if (!res.ok) { setContent(alertHtml('error', esc(problemText(res)))); return; }
      var list = res.data || [];
      var html = '<h1>' + esc(t('yourProducts')) + '</h1>';
      if (list.length === 0) {
        html += '<p class="muted hint">' + esc(t('noProducts')) + '</p>';
      } else {
        html += '<ul class="product-list">' + list.map(function (p) {
          return '<li><a href="#/p/' + p.id + '"><span>' + esc(p.name) + '</span><span class="meta">' + esc(p.sku || '') + '</span></a></li>';
        }).join('') + '</ul>';
      }
      html += '<section class="card"><h2>' + esc(t('newProduct')) + '</h2><form id="new-product"><div class="row">' +
        '<label>' + esc(t('name')) + '<input type="text" name="name" maxlength="100" required></label>' +
        '<label>' + esc(t('sku')) + '<input type="text" name="sku" maxlength="50"></label>' +
        '<button class="btn" type="submit">' + esc(t('create')) + '</button></div>' +
        '<p class="muted">' + esc(t('limitNote')(MAX_PRODUCTS)) + '</p><div id="new-product-msg"></div></form></section>';
      setContent(html);
      el('new-product').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var form = ev.target;
        api('POST', '/api/products', { name: form.name.value, sku: form.sku.value }).then(function (r) {
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
    setContent('<p class="muted">' + esc(t('loading')) + '</p>');
    Promise.all([api('GET', '/api/products/' + id), api('GET', '/api/products/' + id + '/sales'), api('GET', '/api/products/' + id + '/forecast')]).then(function (r) {
      for (var i = 0; i < r.length; i++) if (sessionLost(r[i])) return;
      if (r[0].status === 404) { location.hash = '#/'; return; }
      if (!r[0].ok) { setContent(alertHtml('error', esc(problemText(r[0])))); return; }
      view = { id: id, product: r[0].data, sales: (r[1].data || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }), forecast: r[2].ok ? r[2].data : null };
      renderProduct(flashHtml || '');
    });
  }

  function renderProduct(flashHtml) {
    var p = view.product, sales = view.sales;
    var html = '<p class="crumb"><a href="#/">' + esc(t('allProducts')) + '</a></p>' +
      '<div class="title-row"><h1>' + esc(p.name) + '</h1>' + (p.sku ? '<p class="muted sku">' + esc(p.sku) + '</p>' : '') + '</div><div id="flash">' + flashHtml + '</div>';

    // sales and import
    html += '<section class="card"><h2>' + esc(t('salesTitle')) + '</h2>';
    html += sales.length
      ? '<p>' + esc(t('salesSummary')(num(sales.length, 0), fullDate(sales[0].date), fullDate(sales[sales.length - 1].date))) + '</p>'
      : '<p class="muted">' + esc(t('noSales')) + '</p>';
    html += '<h3>' + esc(t('importTitle')) + '</h3><p class="muted hint">' + esc(t('importHelp')) + '</p>' +
      '<details class="fold"><summary><h3 style="margin:0">' + esc(t('formatTitle')) + '</h3></summary><pre><code>' + esc(SAMPLE) + '</code></pre></details>' +
      '<form id="import-form"><div class="row"><label>CSV<input type="file" name="file" accept=".csv,text/csv,text/plain"></label>' +
      '<button class="btn" type="submit" id="import-button">' + esc(t('importButton')) + '</button></div><div id="import-msg"></div></form></section>';

    // forecast
    html += '<section class="card stage"><h2>' + esc(t('forecastTitle')) + '</h2>' +
      '<form id="forecast-form"><div class="row">' +
      '<label>' + esc(t('horizon')) + '<input type="number" name="horizon" min="1" max="90" value="28"></label>' +
      '<label>' + esc(t('method')) + '<select name="method"><option value="auto">' + esc(t('methodAuto')) + '</option><option value="ets">ETS</option><option value="naive">naive</option></select></label>' +
      '<button class="btn" type="submit" id="forecast-button">' + esc(t('compute')) + '</button></div><div id="forecast-msg"></div></form>' +
      '<div id="forecast-result"></div></section>';

    // reorder
    html += '<section class="card" id="reorder-card" hidden><h2>' + esc(t('reorderTitle')) + '</h2><p class="muted">' + esc(t('reorderNote')) + '</p>' +
      '<form id="reorder-form"><div class="row">' +
      '<label>' + esc(t('leadTime')) + '<input type="number" name="lead" min="1" max="60" value="7"></label>' +
      '<label>' + esc(t('reviewDays')) + '<input type="number" name="review" min="0" max="60" value="7"></label>' +
      '<label>' + esc(t('serviceLevel')) + '<select name="level"><option>90</option><option selected>95</option><option>98</option><option>99</option></select></label>' +
      '<label>' + esc(t('onHand')) + '<input type="number" name="onhand" min="0" step="any"></label>' +
      '<button class="btn" type="submit">' + esc(t('calculate')) + '</button></div></form><div id="reorder-result"></div></section>';

    html += '<p><button class="btn btn-secondary danger" type="button" id="delete-product">' + esc(t('deleteProduct')) + '</button></p>';
    setContent(html);

    el('import-form').addEventListener('submit', onImport);
    el('forecast-form').addEventListener('submit', onForecast);
    el('reorder-form').addEventListener('submit', function (ev) { ev.preventDefault(); loadReorder(); });
    el('delete-product').addEventListener('click', onDelete);
    paintForecast();
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
      if (res.ok) {
        var d = res.data, html = alertHtml('ok', esc(t('imported')(num(d.inserted, 0), num(d.updated, 0))) + (d.duplicatesInFile ? ' ' + esc(t('dupes')(d.duplicatesInFile)) : ''));
        if (d.rejected) html += alertHtml('warn', esc(t('skipped')(d.rejected))) + errorsTable(d.errors, d.errorsTruncated);
        showProduct(view.id, html);
      } else {
        var extra = res.data && res.data.errors && res.data.errors.length ? errorsTable(res.data.errors, res.data.errorsTruncated) : '';
        msg.innerHTML = alertHtml('error', esc(problemText(res))) + extra;
      }
    });
  }

  function errorsTable(errors, truncated) {
    if (!errors || !errors.length) return '';
    var rows = errors.slice(0, 10).map(function (e) { return '<tr><td class="num">' + esc(e.line) + '</td><td>' + esc(e.message) + '</td></tr>'; }).join('');
    return '<div class="scroll"><table class="table"><thead><tr><th>' + esc(t('line')) + '</th><th>' + esc(t('problem')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      (truncated || errors.length > 10 ? '<p class="muted">' + esc(t('moreProblems')) + '</p>' : '');
  }

  function onForecast(ev) {
    ev.preventDefault();
    var form = ev.target, button = el('forecast-button');
    button.disabled = true; button.textContent = t('computing'); el('forecast-msg').innerHTML = '';
    api('POST', '/api/products/' + view.id + '/forecast', { horizon: Number(form.horizon.value), method: form.method.value }).then(function (res) {
      if (sessionLost(res)) return;
      button.disabled = false; button.textContent = t('compute');
      if (res.status === 201) { view.forecast = res.data; paintForecast(); return; }
      el('forecast-msg').innerHTML = alertHtml('error', esc(problemText(res)));
    });
  }

  function paintForecast() {
    var f = view.forecast, box = el('forecast-result'), card = el('reorder-card');
    if (!f) { box.innerHTML = '<p class="muted">' + esc(t('noForecast')) + '</p>'; card.hidden = true; return; }
    var fc = f.forecast, total = fc.reduce(function (a, p) { return a + p.yhat; }, 0);
    var html = '<p class="lead">' + t('lead')(fc.length, num(total, 0), num(total / fc.length, 0)) + '</p>';
    html += '<div class="chart-wrap">' + chartSvg(view.sales, fc, 120) + '</div>';
    html += '<div class="legend"><span><i class="sw sw-history"></i> ' + esc(t('history')) + '</span><span><i class="sw sw-yhat"></i> ' + esc(t('forecastWord')) + '</span><span><i class="sw sw-band"></i> ' + esc(t('range')) + '</span></div>';
    html += '<p class="muted">' + esc(t('chartNote')(Math.min(120, view.sales.length))) + '</p>';
    html += '<dl class="facts"><div><dt>' + esc(t('methodUsed')) + '</dt><dd><strong>' + esc(f.methodUsed) + '</strong></dd></div>' +
      '<div><dt>' + esc(t('horizonLabel')) + '</dt><dd>' + esc(t('daysN')(f.horizon)) + '</dd></div>' +
      '<div><dt>' + esc(t('checkedOn')) + '</dt><dd>' + esc(t('daysN')(f.holdoutDays)) + '</dd></div></dl>';
    if (f.filledMissingDays > 0) html += '<p class="muted">' + esc(t('filled')(f.filledMissingDays)) + '</p>';
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
    card.hidden = false;
    loadReorder();
  }

  function loadReorder() {
    var form = el('reorder-form'), out = el('reorder-result');
    var q = 'leadTimeDays=' + encodeURIComponent(form.lead.value) + '&reviewDays=' + encodeURIComponent(form.review.value) + '&serviceLevel=' + encodeURIComponent(form.level.value);
    if (form.onhand.value.trim() !== '') q += '&onHand=' + encodeURIComponent(form.onhand.value);
    api('GET', '/api/products/' + view.id + '/reorder?' + q).then(function (res) {
      if (sessionLost(res)) return;
      if (!res.ok) { out.innerHTML = alertHtml('error', esc(problemText(res))); return; }
      var d = res.data;
      var html = '<table class="table narrow"><tbody>' +
        '<tr><td>' + esc(t('rPeriod')) + '</td><td class="num">' + esc(t('daysN')(d.periodDays)) + '</td></tr>' +
        '<tr><td>' + esc(t('rDemand')) + '</td><td class="num">' + qty(d.demandInPeriod) + '</td></tr>' +
        '<tr><td>' + esc(t('rSafety')(d.serviceLevelPercent)) + '</td><td class="num">' + qty(d.safetyStock) + '</td></tr>' +
        '<tr><td>' + esc(t('rLevel')) + '</td><td class="num"><strong>' + qty(d.orderUpToLevel) + '</strong></td></tr>' +
        (d.suggestedOrder === null ? '' : '<tr><td>' + esc(t('rOrder')) + '</td><td class="num"><strong>' + num(d.suggestedOrder, 0) + '</strong></td></tr>') +
        '</tbody></table>';
      if (d.warnings && d.warnings.indexOf('intermittent') >= 0) html += alertHtml('warn', esc(t('intermittent')));
      out.innerHTML = html;
    });
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
      state.user = res.data.login; paintChrome(); route();
    }).catch(function () { setContent(alertHtml('error', esc(t('generic')))); });
  }

  el('btn-en').addEventListener('click', function () { setLang('en'); });
  el('btn-it').addEventListener('click', function () { setLang('it'); });
  el('signout').addEventListener('click', signOut);
  window.addEventListener('hashchange', route);
  start();
})();
