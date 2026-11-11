/* The two small rules of the summary ("In breve") that the demo needs, as plain functions with no page code.
   The Cloudflare app computes the same things on the server (cloudflare/src/engine/summary.ts and reorder.ts): a test runs both on a grid
   of cases and fails if they ever give different answers. */
(function (root) {
  'use strict';

  var SEVERITY = { high: 0, medium: 1, low: 2, very_low: 3 };
  function worse(a, b) { return SEVERITY[a] >= SEVERITY[b] ? a : b; }

  /* How much to trust the forecast, in four words. Indicative, not a guarantee: the average daily error of the check on the past is compared
     with the size of the forecast (under 10% high, under 20% medium, under 35% low, above that very low). A forecast that does no better
     than repeating last week, or a series with 20% or more of the days at zero, is never better than low; with half of the days at zero, very low. */
  function trustVerdict(facts) {
    var errorUnits = facts.maeUsed == null ? null : facts.maeUsed;
    var errorPercent = errorUnits !== null && facts.forecastAvgPerDay > 0 ? (errorUnits / facts.forecastAvgPerDay) * 100 : null;

    var level;
    if (errorPercent === null) level = 'low';
    else if (errorPercent < 10) level = 'high';
    else if (errorPercent < 20) level = 'medium';
    else if (errorPercent < 35) level = 'low';
    else level = 'very_low';

    var usedNaive = String(facts.methodUsed).toLowerCase() === 'naive';
    var improvement = facts.improvementVsNaivePercent;
    var beatsNaive = usedNaive || improvement == null ? null : improvement > 0;
    if (beatsNaive === false) level = worse(level, 'low');

    var zero = facts.zeroDaysPercent || 0;
    var intermittent = zero >= 20;
    if (intermittent) level = worse(level, 'low');
    if (zero >= 50) level = worse(level, 'very_low');

    return { level: level, errorPercent: errorPercent, errorUnits: errorUnits, beatsNaive: beatsNaive, zeroDaysPercent: zero, intermittent: intermittent };
  }

  /* How much to order: what is needed between stock and orders, minus what is already in stock (never below zero, rounded up). */
  function suggestedOrder(orderUpToLevel, onHand) {
    return Math.ceil(Math.max(0, orderUpToLevel - onHand));
  }

  var api = { trustVerdict: trustVerdict, suggestedOrder: suggestedOrder };
  root.LumenSummary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : this);
