-- Migration 002: Allow self-evaluation by removing the grader <> target CHECK constraint.
-- SQLite cannot ALTER TABLE to drop a constraint, so we recreate the table.
-- Safe to re-run: produces identical results each time.

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS submissions_v2 (
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
  ip                  TEXT
);

INSERT OR IGNORE INTO submissions_v2 SELECT * FROM submissions;
DROP TABLE IF EXISTS submissions;
ALTER TABLE submissions_v2 RENAME TO submissions;

CREATE INDEX IF NOT EXISTS idx_subs_lookup
  ON submissions (period_code, grader_student_id, target_student_id, submitted_at DESC);

DROP VIEW IF EXISTS latest_submissions;
CREATE VIEW latest_submissions AS
SELECT s.*
FROM submissions s
JOIN (
  SELECT period_code, grader_student_id, target_student_id, MAX(id) AS max_id
  FROM submissions
  GROUP BY period_code, grader_student_id, target_student_id
) m ON m.max_id = s.id;

-- Drop self_evaluations artefacts if they were created by a prior version of this migration
DROP VIEW IF EXISTS latest_self_evaluations;
DROP TABLE IF EXISTS self_evaluations;

PRAGMA foreign_keys = ON;
