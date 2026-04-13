"""Session management, password hashing, role guards, and rate limiting.

Session cookie `sid` is httponly + SameSite=Lax (Secure in prod via env flag).
Student sessions live 24h; teacher and admin sessions live 8h.
Sessions sliding-renew when less than 1h remains.
"""
from __future__ import annotations

import os
import secrets
import sqlite3
import time
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Iterable, Optional, Tuple

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Request, Response, status

from db import get_db

SESSION_COOKIE = "sid"
STUDENT_TTL = timedelta(hours=24)
STAFF_TTL = timedelta(hours=8)
RENEW_THRESHOLD = timedelta(hours=1)
BCRYPT_ROUNDS = 12
BCRYPT_MAX_LEN = 72


# ─── Password helpers ───────────────────────────────────────────────────

def _clamp(plain: str) -> bytes:
    """Bcrypt's 72-byte cap is hard in bcrypt 5.x. Clamp here to match verify()."""
    return plain.encode("utf-8")[:BCRYPT_MAX_LEN]


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(_clamp(plain), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_clamp(plain), hashed.encode("ascii"))
    except (ValueError, TypeError):
        return False


# ─── Time helpers ───────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fmt(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%d %H:%M:%S")


def _parse(ts: str) -> datetime:
    return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)


def _ttl_for(role: str) -> timedelta:
    return STUDENT_TTL if role == "student" else STAFF_TTL


# ─── Session CRUD ───────────────────────────────────────────────────────

def create_session(conn: sqlite3.Connection, role: str, actor_id: str) -> Tuple[str, datetime]:
    sid = secrets.token_urlsafe(32)
    expires = _now() + _ttl_for(role)
    conn.execute(
        "INSERT INTO sessions (session_id, role, actor_id, expires_at) VALUES (?, ?, ?, ?)",
        (sid, role, actor_id, _fmt(expires)),
    )
    return sid, expires


def destroy_session(conn: sqlite3.Connection, sid: str) -> None:
    conn.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))


def load_session(conn: sqlite3.Connection, sid: str) -> Optional[sqlite3.Row]:
    row = conn.execute(
        "SELECT session_id, role, actor_id, created_at, expires_at FROM sessions WHERE session_id = ?",
        (sid,),
    ).fetchone()
    if row is None:
        return None
    if _parse(row["expires_at"]) <= _now():
        conn.execute("DELETE FROM sessions WHERE session_id = ?", (sid,))
        return None
    return row


def maybe_renew_session(conn: sqlite3.Connection, row: sqlite3.Row) -> Optional[datetime]:
    """Slide expiry forward when <1h remains. Returns new expiry or None."""
    expires = _parse(row["expires_at"])
    if expires - _now() > RENEW_THRESHOLD:
        return None
    new_expires = _now() + _ttl_for(row["role"])
    conn.execute(
        "UPDATE sessions SET expires_at = ? WHERE session_id = ?",
        (_fmt(new_expires), row["session_id"]),
    )
    return new_expires


def set_session_cookie(response: Response, sid: str, expires: datetime) -> None:
    max_age = int((expires - _now()).total_seconds())
    secure = os.environ.get("COOKIE_SECURE", "0") == "1"
    samesite = os.environ.get("COOKIE_SAMESITE", "lax").lower()
    if samesite not in ("lax", "strict", "none"):
        samesite = "lax"
    # SameSite=None requires Secure; upgrade automatically to avoid silent drops.
    if samesite == "none":
        secure = True
    response.set_cookie(
        key=SESSION_COOKIE,
        value=sid,
        max_age=max_age,
        httponly=True,
        samesite=samesite,
        secure=secure,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE, path="/")


# ─── Request helpers ────────────────────────────────────────────────────

def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else ""


def client_ua(request: Request) -> str:
    return request.headers.get("user-agent", "")


# ─── Current user dependency ────────────────────────────────────────────

class CurrentUser:
    __slots__ = ("role", "actor_id", "sid")

    def __init__(self, role: str, actor_id: str, sid: str) -> None:
        self.role = role
        self.actor_id = actor_id
        self.sid = sid


def get_current_user(
    request: Request,
    response: Response,
    session_cookie: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE),
    conn: sqlite3.Connection = Depends(get_db),
) -> Optional[CurrentUser]:
    if not session_cookie:
        return None
    row = load_session(conn, session_cookie)
    if row is None:
        return None
    new_exp = maybe_renew_session(conn, row)
    if new_exp is not None:
        set_session_cookie(response, session_cookie, new_exp)
    user = CurrentUser(role=row["role"], actor_id=row["actor_id"], sid=session_cookie)
    request.state.user = user
    return user


def require_role(*roles: str):
    """FastAPI dependency factory that enforces role membership."""
    allowed = set(roles)

    def _dep(user: Optional[CurrentUser] = Depends(get_current_user)) -> CurrentUser:
        if user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not_logged_in")
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user

    return _dep


# ─── Rate limiter (in-memory, per IP) ───────────────────────────────────

class RateLimiter:
    """Fixed-window counter. Over the window limit triggers a block window."""

    def __init__(self, limit: int, window_sec: int, block_sec: int) -> None:
        self.limit = limit
        self.window_sec = window_sec
        self.block_sec = block_sec
        self._hits: "dict[str, list[float]]" = {}
        self._blocked_until: "dict[str, float]" = {}
        self._lock = Lock()

    def check(self, key: str) -> bool:
        """Return True if the request should pass."""
        now = time.monotonic()
        with self._lock:
            until = self._blocked_until.get(key)
            if until is not None:
                if now < until:
                    return False
                del self._blocked_until[key]
            hits = self._hits.setdefault(key, [])
            cutoff = now - self.window_sec
            hits[:] = [t for t in hits if t > cutoff]
            if len(hits) >= self.limit:
                self._blocked_until[key] = now + self.block_sec
                hits.clear()
                return False
            hits.append(now)
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._blocked_until.clear()


login_limiter = RateLimiter(limit=20, window_sec=60, block_sec=15 * 60)


def enforce_login_rate_limit(request: Request) -> None:
    ip = client_ip(request)
    key = ip or "unknown"
    if not login_limiter.check(key):
        raise HTTPException(status_code=429, detail="rate_limited")


__all__ = [
    "SESSION_COOKIE",
    "CurrentUser",
    "clear_session_cookie",
    "client_ip",
    "client_ua",
    "create_session",
    "destroy_session",
    "enforce_login_rate_limit",
    "get_current_user",
    "hash_password",
    "load_session",
    "login_limiter",
    "require_role",
    "set_session_cookie",
    "verify_password",
]
