/* Builds the CSV files the dashboard lets you download. Plain functions with no page code, so they can be tested.
   Only dates and numbers go into the files: nothing a user typed, so there is nothing to escape. */
(function (root) {
  'use strict';

  function round2(v) { return String(Math.round(v * 100) / 100); }

  var api = {
    /** Same format the importer reads: date,quantity (a file exported here can be imported again). */
    salesCsv: function (rows) {
      return 'date,quantity\n' + rows.map(function (r) { return r.date + ',' + String(r.quantity); }).join('\n') + '\n';
    },
    forecastCsv: function (points) {
      return 'date,forecast,min,max\n' + points.map(function (p) { return [p.date, round2(p.yhat), round2(p.lower), round2(p.upper)].join(','); }).join('\n') + '\n';
    },
    /** "Pane integrale" + "sales" -> "pane-integrale-sales.csv" */
    fileName: function (productName, kind) {
      var base = String(productName).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      return (base || 'product') + '-' + kind + '.csv';
    }
  };

  root.LumenExport = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
