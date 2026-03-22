import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ─── Database Singleton ─────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDbPath(): string {
  const dbDir = path.join(process.cwd(), 'database');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  return path.join(dbDir, 'nuldam.db');
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath = getDbPath();
  _db = new Database(dbPath);

  // Enable WAL mode for better concurrent performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Initialize schema
  initSchema(_db);

  // Run migrations
  runMigrations(_db);

  return _db;
}

function initSchema(db: Database.Database): void {
  const schemaPath = path.join(process.cwd(), 'database', 'schema.sql');

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    // Split by statements and execute individually (skip PRAGMA lines already set)
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .filter((s) => !s.startsWith('PRAGMA'));

    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
      } catch {
        // Table/index/trigger already exists — safe to ignore
      }
    }
  }
}

// ─── Migrations ─────────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  // Migration: expand generation_logs step CHECK to include 'caption' and 'pipeline'
  try {
    // Check if the old constraint is in place by trying to insert a test row
    // If it fails, we need to recreate the table
    const tableInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='generation_logs'"
    ).get() as { sql: string } | undefined;

    if (tableInfo?.sql && !tableInfo.sql.includes("'caption'")) {
      // Need to recreate table with expanded CHECK constraint
      db.exec(`
        CREATE TABLE IF NOT EXISTS generation_logs_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          content_id      INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
          step            TEXT    NOT NULL CHECK (step IN ('script', 'tts', 'video', 'caption', 'pipeline')),
          status          TEXT    NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
          input_params    TEXT,
          output_result   TEXT,
          error_message   TEXT,
          duration_ms     INTEGER,
          created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO generation_logs_new SELECT * FROM generation_logs;
        DROP TABLE generation_logs;
        ALTER TABLE generation_logs_new RENAME TO generation_logs;
        CREATE INDEX IF NOT EXISTS idx_logs_content ON generation_logs(content_id);
        CREATE INDEX IF NOT EXISTS idx_logs_step ON generation_logs(step);
      `);
    }
  } catch {
    // Migration already applied or table doesn't exist yet — safe to ignore
  }
}

// ─── Helper: close db (for testing / graceful shutdown) ─────────────────────

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ─── Typed query helpers ────────────────────────────────────────────────────

export function queryAll<T>(sql: string, params: unknown[] = []): T[] {
  const db = getDb();
  return db.prepare(sql).all(...params) as T[];
}

export function queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
  const db = getDb();
  return db.prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  const db = getDb();
  return db.prepare(sql).run(...params);
}
