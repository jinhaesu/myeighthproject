import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// ─── Database Singleton ─────────────────────────────────────────────────────

let _db: Database.Database | null = null;

function getDbPath(): string {
  // Railway/Docker: /tmp is always writable
  // Local dev: use project directory
  const isProduction = process.env.NODE_ENV === 'production';
  const baseDir = isProduction ? '/tmp' : process.cwd();
  const dbDir = path.join(baseDir, 'database');
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
  // Try multiple paths for schema.sql
  const candidates = [
    path.join(process.cwd(), 'database', 'schema.sql'),
    path.join(__dirname, '..', '..', '..', 'database', 'schema.sql'),
    '/app/database/schema.sql', // Docker path
  ];

  let schema: string | null = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      schema = fs.readFileSync(p, 'utf-8');
      break;
    }
  }

  if (!schema) {
    // Inline fallback schema for production
    schema = `
      CREATE TABLE IF NOT EXISTS contents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK(content_type IN ('health_info','recipe','nutrition_tip')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','script_ready','audio_ready','video_ready','published')),
        language TEXT NOT NULL DEFAULT 'ko' CHECK(language IN ('ko','en')),
        script TEXT,
        sections TEXT,
        audio_path TEXT,
        subtitle_path TEXT,
        video_path TEXT,
        thumbnail_path TEXT,
        scheduled_date TEXT,
        tags TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS calendar_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER REFERENCES contents(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        event_date TEXT NOT NULL,
        event_type TEXT NOT NULL DEFAULT 'health_info',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS generation_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
        step TEXT NOT NULL CHECK(step IN ('script','tts','video','caption','pipeline','image','bgm','ai_video')),
        status TEXT NOT NULL CHECK(status IN ('started','completed','failed')),
        input_params TEXT,
        output_result TEXT,
        error_message TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS prompt_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        content_type TEXT NOT NULL,
        template TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS platform_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL CHECK(platform IN ('instagram','youtube','tiktok','facebook')),
        account_name TEXT NOT NULL,
        handle TEXT,
        credentials TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS publish_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content_id INTEGER NOT NULL REFERENCES contents(id),
        platform_account_id INTEGER NOT NULL REFERENCES platform_accounts(id),
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','publishing','published','failed','cancelled')),
        scheduled_at TEXT NOT NULL,
        published_at TEXT,
        post_url TEXT,
        caption TEXT,
        hashtags TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `;
  }

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

// ─── Migrations ─────────────────────────────────────────────────────────────

function runMigrations(db: Database.Database): void {
  // Migration: expand generation_logs step CHECK to include 'caption' and 'pipeline'
  try {
    // Check if the old constraint is in place by trying to insert a test row
    // If it fails, we need to recreate the table
    const tableInfo = db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='generation_logs'"
    ).get() as { sql: string } | undefined;

    if (tableInfo?.sql && !tableInfo.sql.includes("'image'")) {
      // Need to recreate table with expanded CHECK constraint
      db.exec(`
        CREATE TABLE IF NOT EXISTS generation_logs_new (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          content_id      INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
          step            TEXT    NOT NULL CHECK (step IN ('script', 'tts', 'video', 'caption', 'pipeline', 'image', 'bgm', 'ai_video')),
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
