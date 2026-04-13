"""SQLite connection helpers and migration runner (stdlib sqlite3, no ORM)."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Iterator, Optional

BACKEND_DIR = Path(__file__).resolve().parent
DB_DIR = BACKEND_DIR / ".db"
DB_PATH = DB_DIR / "app.db"
MIGRATIONS_DIR = BACKEND_DIR / "migrations"

_override_path: "Optional[str]" = None  # type: ignore[syntax]


def set_db_path(path: "Optional[str]") -> None:
    """Override DB path (used by tests)."""
    global _override_path
    _override_path = path


def _resolve_path() -> str:
    if _override_path is not None:
        return _override_path
    env_path = os.environ.get("DB_PATH")
    if env_path:
        return env_path
    DB_DIR.mkdir(parents=True, exist_ok=True)
    return str(DB_PATH)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_resolve_path(), isolation_level=None, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    return conn


def init_db() -> None:
    """Apply .sql migrations (tracked), then run Python upgrade steps."""
    conn = connect()
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS _migrations ("
            "  filename TEXT PRIMARY KEY,"
            "  applied_at TEXT NOT NULL DEFAULT (datetime('now'))"
            ")"
        )
        applied = {
            r["filename"]
            for r in conn.execute("SELECT filename FROM _migrations").fetchall()
        }
        for sql_file in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if sql_file.name in applied:
                continue
            conn.executescript(sql_file.read_text(encoding="utf-8"))
            conn.execute(
                "INSERT INTO _migrations (filename) VALUES (?)", (sql_file.name,)
            )
            conn.commit()
        _upgrade_remove_self_eval_check(conn)
    finally:
        conn.close()


_NEW_SUBMISSIONS_DDL = """\
CREATE TABLE submissions_v2 (
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
)"""


def _upgrade_remove_self_eval_check(conn: sqlite3.Connection) -> None:
    """One-time: remove grader<>target CHECK from submissions if present."""
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='submissions'"
    ).fetchone()
    if row is None or "grader_student_id <> target_student_id" not in row["sql"]:
        return  # fresh install or already upgraded

    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute("DROP TABLE IF EXISTS submissions_v2")
        conn.execute(_NEW_SUBMISSIONS_DDL)
        conn.execute("INSERT INTO submissions_v2 SELECT * FROM submissions")
        conn.execute("DROP TABLE submissions")
        conn.execute("ALTER TABLE submissions_v2 RENAME TO submissions")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_subs_lookup"
            " ON submissions (period_code, grader_student_id, target_student_id,"
            " submitted_at DESC)"
        )
        conn.execute("DROP VIEW IF EXISTS latest_submissions")
        conn.execute(
            "CREATE VIEW latest_submissions AS"
            " SELECT s.* FROM submissions s"
            " JOIN ("
            "   SELECT period_code, grader_student_id, target_student_id,"
            "   MAX(id) AS max_id FROM submissions"
            "   GROUP BY period_code, grader_student_id, target_student_id"
            " ) m ON m.max_id = s.id"
        )
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
    # Clean up artefacts from earlier migration attempts
    conn.execute("DROP VIEW IF EXISTS latest_self_evaluations")
    conn.execute("DROP TABLE IF EXISTS self_evaluations")


def get_db() -> "Iterator[sqlite3.Connection]":
    """FastAPI dependency. Opens a connection per request; closes on exit."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
