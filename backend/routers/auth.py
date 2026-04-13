"""Authentication routes — shared `/api/auth/*` surface for all roles.

Flow: POST /identify auto-detects role; students log in directly, teachers/admins
then POST /password. GET /me returns the current session (if any).
"""
from __future__ import annotations

import os
import sqlite3
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from auth import (
    CurrentUser,
    clear_session_cookie,
    create_session,
    destroy_session,
    enforce_login_rate_limit,
    get_current_user,
    load_session,
    set_session_cookie,
    verify_password,
)
from db import get_db
from models import IdentifyIn, PasswordIn
from routers.common import log_event

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _admin_username() -> str:
    return os.environ.get("ADMIN_USERNAME", "admin")


def _admin_password() -> str:
    return os.environ.get("ADMIN_PASSWORD", "")


def _student_profile(conn: sqlite3.Connection, sid_value: str):
    return conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users WHERE student_id = ?",
        (sid_value,),
    ).fetchone()


def _teacher_profile(conn: sqlite3.Connection, username: str):
    return conn.execute(
        "SELECT username, display_name FROM teacher_accounts WHERE username = ?",
        (username,),
    ).fetchone()


def _period_rows(conn: sqlite3.Connection):
    return [
        dict(r)
        for r in conn.execute(
            "SELECT code, label, is_open FROM evaluation_periods ORDER BY "
            "CASE code WHEN 'midterm' THEN 0 WHEN 'final' THEN 1 ELSE 2 END"
        ).fetchall()
    ]


@router.get("/me")
def me(
    user: "Optional[CurrentUser]" = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="not_logged_in")
    payload = {"role": user.role, "actor_id": user.actor_id, "periods": _period_rows(conn)}
    if user.role == "student":
        row = _student_profile(conn, user.actor_id)
        if row is None:
            raise HTTPException(status_code=401, detail="not_logged_in")
        payload["name"] = row["name"]
        payload["class_name"] = row["class_name"]
    elif user.role == "teacher":
        row = _teacher_profile(conn, user.actor_id)
        if row is None:
            raise HTTPException(status_code=401, detail="not_logged_in")
        payload["name"] = row["display_name"]
    else:
        payload["name"] = _admin_username()
    return payload


@router.post("/identify")
def identify(
    body: IdentifyIn,
    request: Request,
    response: Response,
    _rl: None = Depends(enforce_login_rate_limit),
    conn: sqlite3.Connection = Depends(get_db),
):
    ident = body.identifier.strip()
    if not ident:
        raise HTTPException(status_code=422, detail="empty_identifier")

    if ident == _admin_username():
        return {"role": "admin", "need_password": True}

    teacher = _teacher_profile(conn, ident)
    if teacher is not None:
        return {"role": "teacher", "need_password": True}

    student = _student_profile(conn, ident)
    if student is not None:
        sid, expires = create_session(conn, "student", student["student_id"])
        set_session_cookie(response, sid, expires)
        log_event(
            conn,
            request,
            "login_success",
            "student",
            student["student_id"],
            {"identifier": ident, "role": "student"},
        )
        return {
            "role": "student",
            "need_password": False,
            "actor_id": student["student_id"],
            "name": student["name"],
            "class_name": student["class_name"],
            "periods": _period_rows(conn),
        }

    log_event(
        conn,
        request,
        "login_fail",
        "anonymous",
        None,
        {"identifier": ident, "reason": "not_found"},
    )
    raise HTTPException(status_code=404, detail="not_found")


@router.post("/password")
def password(
    body: PasswordIn,
    request: Request,
    response: Response,
    _rl: None = Depends(enforce_login_rate_limit),
    conn: sqlite3.Connection = Depends(get_db),
):
    ident = body.identifier.strip()

    if ident == _admin_username():
        if body.password != _admin_password() or not _admin_password():
            log_event(conn, request, "login_fail", "anonymous", None,
                      {"identifier": ident, "reason": "bad_password"})
            raise HTTPException(status_code=401, detail="bad_password")
        sid, expires = create_session(conn, "admin", ident)
        set_session_cookie(response, sid, expires)
        log_event(conn, request, "login_success", "admin", ident,
                  {"identifier": ident, "role": "admin"})
        return {"role": "admin", "actor_id": ident, "name": ident, "periods": _period_rows(conn)}

    teacher = conn.execute(
        "SELECT username, display_name, password_hash FROM teacher_accounts WHERE username = ?",
        (ident,),
    ).fetchone()
    if teacher is None or not verify_password(body.password, teacher["password_hash"]):
        log_event(conn, request, "login_fail", "anonymous", None,
                  {"identifier": ident, "reason": "bad_password"})
        raise HTTPException(status_code=401, detail="bad_password")
    sid, expires = create_session(conn, "teacher", teacher["username"])
    set_session_cookie(response, sid, expires)
    log_event(conn, request, "login_success", "teacher", teacher["username"],
              {"identifier": ident, "role": "teacher"})
    return {
        "role": "teacher",
        "actor_id": teacher["username"],
        "name": teacher["display_name"],
        "periods": _period_rows(conn),
    }


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    user: "Optional[CurrentUser]" = Depends(get_current_user),
    conn: sqlite3.Connection = Depends(get_db),
):
    if user is not None:
        destroy_session(conn, user.sid)
        log_event(conn, request, "logout", user.role, user.actor_id, {})
    clear_session_cookie(response)
    return Response(status_code=204)
