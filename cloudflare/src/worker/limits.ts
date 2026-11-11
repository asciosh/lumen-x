/** Limits per user: they keep the free Cloudflare plan (and the testers) safe from a runaway upload. */
export const LIMITS = {
  maxProductsPerUser: 10,
  maxCsvBytes: 1_000_000,
  maxRowsPerImport: 5_000,
  /** Days of sales one product can hold (about ten years). */
  maxDaysPerProduct: 3_650,
  /** The models only look at the last year (plus the backtest windows): a longer history only costs CPU. */
  maxDaysForForecast: 1_095,
  /** Old forecast runs are deleted: only the most recent ones are kept for each product. */
  forecastRunsKept: 5,
  maxImportErrorsListed: 100,
  maxNameLength: 100,
  maxSkuLength: 50,
  /** "Rewrite with AI": rewrites per user per day (UTC), and calls per provider per day (to stay inside the free quotas). */
  aiRewritesPerUserPerDay: 10,
  aiCallsPerProviderPerDay: 200,
  /** How long to wait for one provider, and how many providers to try for one request. */
  aiTimeoutMs: 20_000,
  aiMaxAttempts: 3,
} as const;
