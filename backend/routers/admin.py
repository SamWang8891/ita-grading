"""Admin routes: whitelist CRUD, teacher CRUD, period toggle, activity viewer."""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import CurrentUser, hash_password, require_role
from db import get_db
from models import PeriodPatch, StudentIn, StudentPatch, TeacherIn, TeacherPasswordResetIn
from routers.common import log_event

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ─── students / whitelist ───────────────────────────────────────────────

@router.get("/students")
def list_students(conn: sqlite3.Connection = Depends(get_db),
                  _user: CurrentUser = Depends(require_role("admin"))):
    return [
        dict(r)
        for r in conn.execute(
            "SELECT student_id, name, class_name, created_at FROM permitted_users"
            " ORDER BY student_id"
        ).fetchall()
    ]


@router.post("/students", status_code=201)
def add_student(
    body: StudentIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    existing = conn.execute(
        "SELECT 1 FROM permitted_users WHERE student_id = ?", (body.student_id,)
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=409, detail="student_exists")
    conn.execute(
        "INSERT INTO permitted_users (student_id, name, class_name) VALUES (?, ?, ?)",
        (body.student_id, body.name, body.class_name),
    )
    log_event(conn, request, "admin_add_student", "admin", user.actor_id,
              {"student_id": body.student_id})
    return {"student_id": body.student_id}


@router.patch("/students/{sid}")
def edit_student(
    sid: str,
    body: StudentPatch,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    row = conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users WHERE student_id = ?", (sid,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="student_not_found")
    updates: Dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.class_name is not None:
        updates["class_name"] = body.class_name
    if not updates:
        return dict(row)
    cols = ", ".join(f"{k} = ?" for k in updates)
    values = list(updates.values()) + [sid]
    conn.execute(f"UPDATE permitted_users SET {cols} WHERE student_id = ?", values)
    log_event(conn, request, "admin_edit_student", "admin", user.actor_id,
              {"student_id": sid, "fields": list(updates.keys())})
    row = conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users WHERE student_id = ?", (sid,)
    ).fetchone()
    return dict(row)


@router.get("/students/{sid}/impact")
def student_impact(
    sid: str,
    conn: sqlite3.Connection = Depends(get_db),
    _user: CurrentUser = Depends(require_role("admin")),
):
    row = conn.execute(
        "SELECT 1 FROM permitted_users WHERE student_id = ?", (sid,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="student_not_found")
    count_row = conn.execute(
        "SELECT COUNT(*) AS cnt FROM submissions"
        " WHERE grader_student_id = ? OR target_student_id = ?",
        (sid, sid),
    ).fetchone()
    cnt = int(count_row["cnt"])
    return {"submission_count": cnt, "can_delete": cnt == 0}


@router.delete("/students/{sid}", status_code=204)
def delete_student(
    sid: str,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    row = conn.execute(
        "SELECT 1 FROM permitted_users WHERE student_id = ?", (sid,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="student_not_found")
    cnt = conn.execute(
        "SELECT COUNT(*) AS cnt FROM submissions"
        " WHERE grader_student_id = ? OR target_student_id = ?",
        (sid, sid),
    ).fetchone()["cnt"]
    if int(cnt) > 0:
        raise HTTPException(status_code=409, detail="has_submissions")
    conn.execute("DELETE FROM permitted_users WHERE student_id = ?", (sid,))
    log_event(conn, request, "admin_delete_student", "admin", user.actor_id,
              {"student_id": sid})
    return None


# ─── teachers ───────────────────────────────────────────────────────────

@router.get("/teachers")
def list_teachers(conn: sqlite3.Connection = Depends(get_db),
                  _user: CurrentUser = Depends(require_role("admin"))):
    return [
        dict(r)
        for r in conn.execute(
            "SELECT username, display_name, created_at FROM teacher_accounts ORDER BY username"
        ).fetchall()
    ]


@router.post("/teachers", status_code=201)
def add_teacher(
    body: TeacherIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    existing = conn.execute(
        "SELECT 1 FROM teacher_accounts WHERE username = ?", (body.username,)
    ).fetchone()
    if existing is not None:
        raise HTTPException(status_code=409, detail="teacher_exists")
    conn.execute(
        "INSERT INTO teacher_accounts (username, password_hash, display_name)"
        " VALUES (?, ?, ?)",
        (body.username, hash_password(body.initial_password), body.display_name),
    )
    log_event(conn, request, "admin_add_teacher", "admin", user.actor_id,
              {"username": body.username})
    return {"username": body.username}


@router.post("/teachers/{username}/password")
def reset_teacher_password(
    username: str,
    body: TeacherPasswordResetIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    row = conn.execute(
        "SELECT 1 FROM teacher_accounts WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="teacher_not_found")
    conn.execute(
        "UPDATE teacher_accounts SET password_hash = ? WHERE username = ?",
        (hash_password(body.new_password), username),
    )
    log_event(conn, request, "admin_reset_teacher_password", "admin", user.actor_id,
              {"username": username})
    return {"ok": True}


@router.delete("/teachers/{username}", status_code=204)
def delete_teacher(
    username: str,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    row = conn.execute(
        "SELECT 1 FROM teacher_accounts WHERE username = ?", (username,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="teacher_not_found")
    conn.execute("DELETE FROM teacher_accounts WHERE username = ?", (username,))
    log_event(conn, request, "admin_delete_teacher", "admin", user.actor_id,
              {"username": username})
    return None


# ─── periods ────────────────────────────────────────────────────────────

@router.get("/periods")
def list_periods(conn: sqlite3.Connection = Depends(get_db),
                 _user: CurrentUser = Depends(require_role("admin"))):
    return [
        dict(r)
        for r in conn.execute(
            "SELECT code, label, is_open FROM evaluation_periods ORDER BY "
            "CASE code WHEN 'midterm' THEN 0 WHEN 'final' THEN 1 ELSE 2 END"
        ).fetchall()
    ]


@router.patch("/periods/{code}")
def toggle_period(
    code: str,
    body: PeriodPatch,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("admin")),
):
    row = conn.execute(
        "SELECT 1 FROM evaluation_periods WHERE code = ?", (code,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    conn.execute(
        "UPDATE evaluation_periods SET is_open = ? WHERE code = ?",
        (1 if body.is_open else 0, code),
    )
    log_event(conn, request, "admin_toggle_period", "admin", user.actor_id,
              {"code": code, "is_open": body.is_open})
    return {"code": code, "is_open": body.is_open}


# ─── activity audit ─────────────────────────────────────────────────────

@router.get("/activity")
def activity(
    event_type: Optional[str] = Query(default=None, max_length=64),
    actor_id: Optional[str] = Query(default=None, max_length=32),
    from_ts: Optional[str] = Query(default=None, alias="from", max_length=32),
    to_ts: Optional[str] = Query(default=None, alias="to", max_length=32),
    limit: int = Query(default=200, ge=1, le=2000),
    conn: sqlite3.Connection = Depends(get_db),
    _user: CurrentUser = Depends(require_role("admin")),
):
    clauses: List[str] = []
    params: List[Any] = []
    if event_type:
        clauses.append("event_type = ?")
        params.append(event_type)
    if actor_id:
        clauses.append("actor_id = ?")
        params.append(actor_id)
    if from_ts:
        clauses.append("ts >= ?")
        params.append(from_ts)
    if to_ts:
        clauses.append("ts <= ?")
        params.append(to_ts)
    where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    rows = conn.execute(
        "SELECT id, event_type, actor_role, actor_id, ip, ua, ts, detail_json"
        f" FROM activity_log{where} ORDER BY id DESC LIMIT ?",
        params,
    ).fetchall()
    return [
        {
            "id": r["id"],
            "event_type": r["event_type"],
            "actor_role": r["actor_role"],
            "actor_id": r["actor_id"],
            "ip": r["ip"],
            "ua": r["ua"],
            "ts": r["ts"],
            "detail": json.loads(r["detail_json"] or "{}"),
        }
        for r in rows
    ]
