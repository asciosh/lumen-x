import type { ForecastResult, SalePoint } from "../engine/types";
import { LIMITS } from "./limits";

/** The small part of the D1 API that is used here (a D1 database satisfies it; the tests use SQLite). */
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface Db {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface ProductDto {
  id: number;
  name: string;
  sku: string | null;
  createdAtUtc: string;
}

export interface StoredForecast extends ForecastResult {
  id: number;
  productId: number;
  createdAtUtc: string;
}

interface ProductRow {
  id: number;
  name: string;
  sku: string | null;
  created_at_utc: string;
}

const toProduct = (r: ProductRow): ProductDto => ({ id: r.id, name: r.name, sku: r.sku, createdAtUtc: r.created_at_utc });

/** Every product query goes through the owner: a user can never reach the data of somebody else. */
export class Store {
  constructor(private readonly db: Db) {}

  async listProducts(owner: string): Promise<ProductDto[]> {
    const { results } = await this.db
      .prepare("SELECT id, name, sku, created_at_utc FROM products WHERE owner = ? ORDER BY name COLLATE NOCASE")
      .bind(owner)
      .all<ProductRow>();
    return results.map(toProduct);
  }

  async getProduct(owner: string, id: number): Promise<ProductDto | null> {
    const row = await this.db
      .prepare("SELECT id, name, sku, created_at_utc FROM products WHERE id = ? AND owner = ?")
      .bind(id, owner)
      .first<ProductRow>();
    return row === null ? null : toProduct(row);
  }

  async countProducts(owner: string): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM products WHERE owner = ?").bind(owner).first<{ n: number }>();
    return row?.n ?? 0;
  }

  /** Returns null if the user already has a product with that name (case-insensitive). */
  async createProduct(owner: string, name: string, sku: string | null, nowIso: string): Promise<ProductDto | null> {
    try {
      await this.db
        .prepare("INSERT INTO products (owner, name, sku, created_at_utc) VALUES (?, ?, ?, ?)")
        .bind(owner, name, sku, nowIso)
        .run();
    } catch (error) {
      if (String(error).includes("UNIQUE constraint failed")) {
        return null;
      }
      throw error;
    }
    const row = await this.db
      .prepare("SELECT id, name, sku, created_at_utc FROM products WHERE owner = ? AND name = ? COLLATE NOCASE")
      .bind(owner, name)
      .first<ProductRow>();
    return toProduct(row!);
  }

  /** Deletes a product with its sales and forecasts. The product is checked by the caller. */
  async deleteProduct(id: number): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM forecast_runs WHERE product_id = ?").bind(id),
      this.db.prepare("DELETE FROM sales WHERE product_id = ?").bind(id),
      this.db.prepare("DELETE FROM products WHERE id = ?").bind(id),
    ]);
  }

  /** Deletes every product of a user, with its sales and forecasts: "delete all my data". */
  async deleteAllForOwner(owner: string): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM forecast_runs WHERE product_id IN (SELECT id FROM products WHERE owner = ?)").bind(owner),
      this.db.prepare("DELETE FROM sales WHERE product_id IN (SELECT id FROM products WHERE owner = ?)").bind(owner),
      this.db.prepare("DELETE FROM products WHERE owner = ?").bind(owner),
    ]);
  }

  async countSales(productId: number): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS n FROM sales WHERE product_id = ?").bind(productId).first<{ n: number }>();
    return row?.n ?? 0;
  }

  async existingDates(productId: number, from: string, to: string): Promise<Set<string>> {
    const { results } = await this.db
      .prepare("SELECT date FROM sales WHERE product_id = ? AND date BETWEEN ? AND ?")
      .bind(productId, from, to)
      .all<{ date: string }>();
    return new Set(results.map((r) => r.date));
  }

  /** Inserts or updates the days (the same date overwrites the quantity). In batches, to stay within D1 limits. */
  async upsertSales(productId: number, rows: readonly SalePoint[]): Promise<void> {
    const sql =
      "INSERT INTO sales (product_id, date, quantity) VALUES (?, ?, ?) ON CONFLICT (product_id, date) DO UPDATE SET quantity = excluded.quantity";
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      await this.db.batch(chunk.map((r) => this.db.prepare(sql).bind(productId, r.date, r.quantity)));
    }
  }

  async listSales(productId: number, from: string | null, to: string | null): Promise<SalePoint[]> {
    const { results } = await this.db
      .prepare("SELECT date, quantity FROM sales WHERE product_id = ? AND date >= ? AND date <= ? ORDER BY date")
      .bind(productId, from ?? "0000-01-01", to ?? "9999-12-31")
      .all<SalePoint>();
    return results;
  }

  /** The most recent `limit` days, oldest first. */
  async latestSales(productId: number, limit: number): Promise<SalePoint[]> {
    const { results } = await this.db
      .prepare("SELECT date, quantity FROM sales WHERE product_id = ? ORDER BY date DESC LIMIT ?")
      .bind(productId, limit)
      .all<SalePoint>();
    return results.reverse();
  }

  async zeroStats(productId: number): Promise<{ days: number; zeroDays: number }> {
    const row = await this.db
      .prepare("SELECT COUNT(*) AS days, COALESCE(SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END), 0) AS zeros FROM sales WHERE product_id = ?")
      .bind(productId)
      .first<{ days: number; zeros: number }>();
    return { days: row?.days ?? 0, zeroDays: row?.zeros ?? 0 };
  }

  async saveForecast(productId: number, result: ForecastResult, nowIso: string): Promise<StoredForecast> {
    await this.db
      .prepare(
        `INSERT INTO forecast_runs (product_id, created_at_utc, method_requested, method_used, horizon, holdout_days,
           filled_missing_days, interval_level, backtest_json, points_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        productId,
        nowIso,
        result.methodRequested,
        result.methodUsed,
        result.horizon,
        result.holdoutDays,
        result.filledMissingDays,
        result.intervalLevel,
        JSON.stringify(result.backtest),
        JSON.stringify(result.forecast),
      )
      .run();
    const saved = (await this.latestForecast(productId))!;
    // Keep only the most recent runs of this product.
    await this.db
      .prepare("DELETE FROM forecast_runs WHERE product_id = ? AND id NOT IN (SELECT id FROM forecast_runs WHERE product_id = ? ORDER BY id DESC LIMIT ?)")
      .bind(productId, productId, LIMITS.forecastRunsKept)
      .run();
    return saved;
  }

  async latestForecast(productId: number): Promise<StoredForecast | null> {
    const row = await this.db
      .prepare("SELECT * FROM forecast_runs WHERE product_id = ? ORDER BY id DESC LIMIT 1")
      .bind(productId)
      .first<Record<string, unknown>>();
    if (row === null) {
      return null;
    }
    return {
      id: row["id"] as number,
      productId: row["product_id"] as number,
      createdAtUtc: row["created_at_utc"] as string,
      methodRequested: row["method_requested"] as StoredForecast["methodRequested"],
      methodUsed: row["method_used"] as StoredForecast["methodUsed"],
      horizon: row["horizon"] as number,
      holdoutDays: row["holdout_days"] as number,
      filledMissingDays: row["filled_missing_days"] as number,
      intervalLevel: row["interval_level"] as number,
      backtest: JSON.parse(row["backtest_json"] as string) as StoredForecast["backtest"],
      forecast: JSON.parse(row["points_json"] as string) as StoredForecast["forecast"],
    };
  }
}
