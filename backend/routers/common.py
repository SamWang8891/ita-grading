"""Shared helpers used by multiple routers (activity log writer)."""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, Optional

from fastapi import Request

from auth import client_ip, client_ua


def log_event(
    conn: sqlite3.Connection,
    request: Request,
    event_type: str,
    actor_role: str,
    actor_id: "Optional[str]",
    detail: "Optional[Dict[str, Any]]" = None,
) -> None:
    conn.execute(
        "INSERT INTO activity_log (event_type, actor_role, actor_id, ip, ua, detail_json)"
        " VALUES (?, ?, ?, ?, ?, ?)",
        (
            event_type,
            actor_role,
            actor_id,
            client_ip(request),
            client_ua(request),
            json.dumps(detail or {}, ensure_ascii=False),
        ),
    )
