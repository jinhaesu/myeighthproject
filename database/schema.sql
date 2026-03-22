-- Nuldam Content Management Schema
-- SQLite with WAL mode

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Contents ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contents (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  content_type    TEXT    NOT NULL CHECK (content_type IN ('health_info', 'recipe', 'nutrition_tip')),
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'script_ready', 'audio_ready', 'video_ready', 'published')),
  language        TEXT    NOT NULL DEFAULT 'ko' CHECK (language IN ('ko', 'en')),
  script          TEXT,
  sections        TEXT,          -- JSON array of ScriptSection
  audio_path      TEXT,
  subtitle_path   TEXT,
  video_path      TEXT,
  thumbnail_path  TEXT,
  scheduled_date  TEXT,          -- ISO 8601 date string
  tags            TEXT,          -- JSON array of strings
  metadata        TEXT,          -- JSON object
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Calendar Events ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id      INTEGER REFERENCES contents(id) ON DELETE SET NULL,
  title           TEXT    NOT NULL,
  description     TEXT,
  event_date      TEXT    NOT NULL,
  event_type      TEXT    NOT NULL CHECK (event_type IN ('health_info', 'recipe', 'nutrition_tip')),
  status          TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'script_ready', 'audio_ready', 'video_ready', 'published')),
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Generation Logs ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generation_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id      INTEGER NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  step            TEXT    NOT NULL CHECK (step IN ('script', 'tts', 'video', 'caption', 'pipeline', 'image', 'bgm', 'ai_video', 'heygen')),
  status          TEXT    NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
  input_params    TEXT,          -- JSON
  output_result   TEXT,          -- JSON
  error_message   TEXT,
  duration_ms     INTEGER,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Prompt Templates ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL UNIQUE,
  content_type    TEXT    NOT NULL CHECK (content_type IN ('health_info', 'recipe', 'nutrition_tip')),
  template        TEXT    NOT NULL,
  language        TEXT    NOT NULL DEFAULT 'ko' CHECK (language IN ('ko', 'en')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Platform Accounts ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  platform        TEXT    NOT NULL CHECK (platform IN ('instagram', 'youtube', 'tiktok', 'facebook')),
  account_name    TEXT    NOT NULL,
  handle          TEXT,
  credentials     TEXT,          -- JSON: encrypted API keys/tokens
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Publish Jobs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS publish_jobs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  content_id          INTEGER NOT NULL REFERENCES contents(id),
  platform_account_id INTEGER NOT NULL REFERENCES platform_accounts(id),
  status              TEXT    NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  scheduled_at        TEXT    NOT NULL,
  published_at        TEXT,
  post_url            TEXT,
  caption             TEXT,
  hashtags            TEXT,          -- JSON array
  error_message       TEXT,
  retry_count         INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ─── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_contents_status       ON contents(status);
CREATE INDEX IF NOT EXISTS idx_contents_type         ON contents(content_type);
CREATE INDEX IF NOT EXISTS idx_contents_scheduled    ON contents(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_calendar_date         ON calendar_events(event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_content      ON calendar_events(content_id);
CREATE INDEX IF NOT EXISTS idx_logs_content          ON generation_logs(content_id);
CREATE INDEX IF NOT EXISTS idx_logs_step             ON generation_logs(step);
CREATE INDEX IF NOT EXISTS idx_platform_accounts_platform ON platform_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_content  ON publish_jobs(content_id);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_status   ON publish_jobs(status);
CREATE INDEX IF NOT EXISTS idx_publish_jobs_scheduled ON publish_jobs(scheduled_at);

-- ─── Triggers ───────────────────────────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS trg_contents_updated_at
  AFTER UPDATE ON contents
  FOR EACH ROW
BEGIN
  UPDATE contents SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_calendar_updated_at
  AFTER UPDATE ON calendar_events
  FOR EACH ROW
BEGIN
  UPDATE calendar_events SET updated_at = datetime('now') WHERE id = OLD.id;
END;
