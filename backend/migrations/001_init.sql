-- 1) 白名單
CREATE TABLE IF NOT EXISTS permitted_users (
  student_id  TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  class_name  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2) 老師帳號
CREATE TABLE IF NOT EXISTS teacher_accounts (
  username       TEXT PRIMARY KEY,
  password_hash  TEXT NOT NULL,
  display_name   TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3) 評分場次
CREATE TABLE IF NOT EXISTS evaluation_periods (
  code     TEXT PRIMARY KEY,
  label    TEXT NOT NULL,
  is_open  INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO evaluation_periods (code, label, is_open) VALUES
  ('midterm', '期中報告', 0),
  ('final',   '期末報告', 0);

-- 4) 評分主表（保留完整版本歷史）
CREATE TABLE IF NOT EXISTS submissions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  period_code         TEXT NOT NULL REFERENCES evaluation_periods(code),
  grader_student_id   TEXT NOT NULL REFERENCES permitted_users(student_id),
  target_student_id   TEXT NOT NULL REFERENCES permitted_users(student_id),
  score_topic         INTEGER NOT NULL CHECK (score_topic        BETWEEN 0 AND 30),
  score_content       INTEGER NOT NULL CHECK (score_content      BETWEEN 0 AND 30),
  score_narrative     INTEGER NOT NULL CHECK (score_narrative    BETWEEN 0 AND 20),
  score_presentation  INTEGER NOT NULL CHECK (score_presentation BETWEEN 0 AND 10),
  score_teamwork      INTEGER NOT NULL CHECK (score_teamwork     BETWEEN 0 AND 10),
  comment             TEXT NOT NULL DEFAULT '',
  self_note           TEXT NOT NULL DEFAULT '',
  submitted_at        TEXT NOT NULL DEFAULT (datetime('now')),
  source              TEXT NOT NULL,
  ua                  TEXT,
  ip                  TEXT,
  CHECK (grader_student_id <> target_student_id)
);
CREATE INDEX IF NOT EXISTS idx_subs_lookup
  ON submissions (period_code, grader_student_id, target_student_id, submitted_at DESC);

CREATE VIEW IF NOT EXISTS latest_submissions AS
SELECT s.*
FROM submissions s
JOIN (
  SELECT period_code, grader_student_id, target_student_id, MAX(id) AS max_id
  FROM submissions
  GROUP BY period_code, grader_student_id, target_student_id
) m ON m.max_id = s.id;

-- 5) 活動紀錄
CREATE TABLE IF NOT EXISTS activity_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type   TEXT NOT NULL,
  actor_role   TEXT NOT NULL,
  actor_id     TEXT,
  ip           TEXT,
  ua           TEXT,
  ts           TEXT NOT NULL DEFAULT (datetime('now')),
  detail_json  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_log_actor ON activity_log (actor_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_log_type  ON activity_log (event_type, ts DESC);

-- 6) 伺服器端 session
CREATE TABLE IF NOT EXISTS sessions (
  session_id  TEXT PRIMARY KEY,
  role        TEXT NOT NULL,
  actor_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_exp ON sessions (expires_at);
