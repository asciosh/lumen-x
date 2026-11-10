-- Lumen-X, Cloudflare edition: database schema (D1 is SQLite).
-- Every product belongs to one user ("github:<numeric id>", from the GitHub login); sales and forecasts belong to a product.

CREATE TABLE products (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  owner          TEXT NOT NULL,
  name           TEXT NOT NULL,
  sku            TEXT,
  created_at_utc TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_products_owner_name ON products (owner, name COLLATE NOCASE);

CREATE TABLE sales (
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  date       TEXT NOT NULL,   -- YYYY-MM-DD
  quantity   REAL NOT NULL,
  PRIMARY KEY (product_id, date)
) WITHOUT ROWID;

CREATE TABLE forecast_runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id          INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  created_at_utc      TEXT NOT NULL,
  method_requested    TEXT NOT NULL,
  method_used         TEXT NOT NULL,
  horizon             INTEGER NOT NULL,
  holdout_days        INTEGER NOT NULL,
  filled_missing_days INTEGER NOT NULL,
  interval_level      REAL NOT NULL,
  backtest_json       TEXT NOT NULL,
  points_json         TEXT NOT NULL
);
CREATE INDEX ix_forecast_runs_product ON forecast_runs (product_id, id DESC);
