/* A D1Database stand-in backed by node:sqlite (real SQLite, real migrations), covering the subset the Worker uses:
   prepare().bind().first(column?) and .run(). `failNext()` makes the next statement throw, like a D1 outage. */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

const MIGRATIONS = path.resolve(import.meta.dirname, "../migrations");

export class FakeD1 {
  readonly sqlite = new DatabaseSync(":memory:");
  private failures = 0;

  constructor() {
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      this.sqlite.exec(readFileSync(path.join(MIGRATIONS, file), "utf8"));
    }
  }

  failNext(times = 1): void {
    this.failures = times;
  }

  rows(): Record<string, unknown>[] {
    return this.sqlite.prepare("SELECT * FROM waitlist ORDER BY created_at, email").all() as Record<string, unknown>[];
  }

  intents(): Record<string, unknown>[] {
    return this.sqlite.prepare("SELECT * FROM pricing_intents ORDER BY id").all() as Record<string, unknown>[];
  }

  insertIntent(row: { email: string; created_at: string; ip_hash?: string }): void {
    this.sqlite
      .prepare("INSERT INTO pricing_intents (email, full_name, industry, created_at, ip_hash) VALUES (?, 'Test', 'other', ?, ?)")
      .run(row.email, row.created_at, row.ip_hash ?? "h");
  }

  insert(row: { email: string; source?: string; country?: string | null; created_at: string; ip_hash: string }): void {
    this.sqlite
      .prepare("INSERT INTO waitlist (email, source, country, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)")
      .run(row.email, row.source ?? "v1", row.country ?? null, row.created_at, row.ip_hash);
  }

  prepare(sql: string) {
    return new FakeStatement(this, sql, []);
  }

  /** @internal */
  guard(): void {
    if (this.failures > 0) {
      this.failures -= 1;
      throw new Error("D1_ERROR: simulated outage");
    }
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }
}

class FakeStatement {
  constructor(
    private readonly db: FakeD1,
    private readonly sql: string,
    private readonly params: SQLInputValue[],
  ) {}

  // D1 binds ?1..?N positionally; node:sqlite accepts the same numbered placeholders.
  bind(...params: unknown[]) {
    return new FakeStatement(this.db, this.sql, params as SQLInputValue[]);
  }

  async first<T>(column?: string): Promise<T | null> {
    this.db.guard();
    const row = this.db.sqlite.prepare(this.sql).get(...this.params) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? (row[column] ?? null) : row) as T | null;
  }

  async run() {
    this.db.guard();
    const result = this.db.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  }
}
