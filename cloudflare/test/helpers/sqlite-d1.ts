import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { D1Statement, Db } from "../../src/worker/db";

/** A real SQLite database (the engine D1 is built on) behind the same small interface, with the real schema. */
export function createTestDb(): Db {
  const raw = new DatabaseSync(":memory:");
  const folder = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(folder).filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(new URL(file, folder), "utf8"));
  }

  const statement = (sql: string, values: unknown[] = []): D1Statement => ({
    bind: (...v) => statement(sql, v),
    first: async <T>() => (raw.prepare(sql).get(...(values as SQLInputValue[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: raw.prepare(sql).all(...(values as SQLInputValue[])) as T[] }),
    run: async () => raw.prepare(sql).run(...(values as SQLInputValue[])),
  });

  return {
    prepare: (sql) => statement(sql),
    // Like D1, a batch is all or nothing.
    batch: async (statements) => {
      raw.exec("BEGIN");
      try {
        for (const s of statements) await s.run();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
      return [];
    },
  };
}
