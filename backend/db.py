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
    """Apply unapplied .sql migrations in order, tracking each in _migrations."""
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
    finally:
        conn.close()


def get_db() -> "Iterator[sqlite3.Connection]":
    """FastAPI dependency. Opens a connection per request; closes on exit."""
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()
