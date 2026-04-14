"""Student routes: evaluate, submissions, history, JSON download/upload."""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from auth import CurrentUser, client_ip, client_ua, require_role
from db import get_db
from models import JsonPayload, SubmissionIn
from routers.common import log_event

router = APIRouter(prefix="/api/student", tags=["student"])


# ─── helpers ────────────────────────────────────────────────────────────

def _total(row: Any) -> int:
    return (
        row["score_topic"]
        + row["score_content"]
        + row["score_narrative"]
        + row["score_presentation"]
        + row["score_teamwork"]
    )


def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
    out = dict(row)
    out["total"] = _total(row)
    return out


def _period_row(conn: sqlite3.Connection, code: str) -> Optional[sqlite3.Row]:
    return conn.execute(
        "SELECT code, label, is_open FROM evaluation_periods WHERE code = ?", (code,)
    ).fetchone()


def _require_open_period(conn: sqlite3.Connection, code: str) -> None:
    row = _period_row(conn, code)
    if row is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    if row["is_open"] != 1:
        raise HTTPException(status_code=409, detail="period_closed")


def _require_target(conn: sqlite3.Connection, target_id: str) -> sqlite3.Row:
    target = conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users WHERE student_id = ?",
        (target_id,),
    ).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="target_not_found")
    return target


def _insert_submission(
    conn: sqlite3.Connection,
    request: Request,
    grader_id: str,
    period: str,
    target_id: str,
    scores: Dict[str, int],
    comment: str,
    self_note: str,
    source: str,
) -> int:
    cur = conn.execute(
        "INSERT INTO submissions ("
        "  period_code, grader_student_id, target_student_id,"
        "  score_topic, score_content, score_narrative, score_presentation, score_teamwork,"
        "  comment, self_note, source, ua, ip"
        ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (
            period,
            grader_id,
            target_id,
            scores["topic"],
            scores["content"],
            scores["narrative"],
            scores["presentation"],
            scores["teamwork"],
            comment,
            self_note,
            source,
            client_ua(request),
            client_ip(request),
        ),
    )
    return int(cur.lastrowid)


# ─── read endpoints ─────────────────────────────────────────────────────

@router.get("/periods")
def periods(conn: sqlite3.Connection = Depends(get_db),
            _user: CurrentUser = Depends(require_role("student"))):
    return [
        dict(r)
        for r in conn.execute(
            "SELECT code, label, is_open FROM evaluation_periods ORDER BY "
            "CASE code WHEN 'midterm' THEN 0 WHEN 'final' THEN 1 ELSE 2 END"
        ).fetchall()
    ]


@router.get("/targets")
def targets(
    period: str = Query(..., min_length=1, max_length=32),
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    if _period_row(conn, period) is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    rows = conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users "
        "ORDER BY student_id",
    ).fetchall()
    latest = {
        r["target_student_id"]: r
        for r in conn.execute(
            "SELECT * FROM latest_submissions WHERE period_code = ? AND grader_student_id = ?",
            (period, user.actor_id),
        ).fetchall()
    }
    out: List[Dict[str, Any]] = []
    for r in rows:
        latest_row = latest.get(r["student_id"])
        out.append(
            {
                "student_id": r["student_id"],
                "name": r["name"],
                "class_name": r["class_name"],
                "evaluated": latest_row is not None,
                "total": _total(latest_row) if latest_row is not None else None,
            }
        )
    return out


@router.get("/submissions/{period}/{target_id}/detail")
def get_submission_detail(
    period: str,
    target_id: str,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    if _period_row(conn, period) is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    _require_target(conn, target_id)
    latest = conn.execute(
        "SELECT * FROM latest_submissions "
        "WHERE period_code = ? AND grader_student_id = ? AND target_student_id = ?",
        (period, user.actor_id, target_id),
    ).fetchone()
    versions = conn.execute(
        "SELECT id, submitted_at, source, score_topic, score_content, score_narrative,"
        " score_presentation, score_teamwork, comment, self_note FROM submissions"
        " WHERE period_code = ? AND grader_student_id = ? AND target_student_id = ?"
        " ORDER BY id DESC",
        (period, user.actor_id, target_id),
    ).fetchall()
    log_event(conn, request, "view_target", "student", user.actor_id,
              {"period": period, "target_id": target_id})
    return {
        "latest": _row_to_dict(latest) if latest is not None else None,
        "versions": [_row_to_dict(v) for v in versions],
    }


@router.get("/activity")
def my_activity(
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    rows = conn.execute(
        "SELECT id, event_type, ip, ua, ts, detail_json FROM activity_log"
        " WHERE actor_id = ? AND actor_role = 'student' ORDER BY id DESC LIMIT 500",
        (user.actor_id,),
    ).fetchall()
    log_event(conn, request, "view_own_records", "student", user.actor_id, {})
    return [
        {
            "id": r["id"],
            "event_type": r["event_type"],
            "ip": r["ip"],
            "ua": r["ua"],
            "ts": r["ts"],
            "detail": json.loads(r["detail_json"] or "{}"),
        }
        for r in rows
    ]


# ─── write endpoints ────────────────────────────────────────────────────

@router.post("/submissions")
def create_submission(
    body: SubmissionIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    _require_open_period(conn, body.period)
    _require_target(conn, body.target_student_id)
    submission_id = _insert_submission(
        conn,
        request,
        user.actor_id,
        body.period,
        body.target_student_id,
        body.scores.model_dump(),
        body.comment,
        body.self_note,
        "form",
    )
    log_event(
        conn,
        request,
        "submit_grade",
        "student",
        user.actor_id,
        {"period": body.period, "target_id": body.target_student_id,
         "submission_id": submission_id, "source": "form"},
    )
    return {"id": submission_id}


@router.post("/submissions/batch")
def create_submissions_batch(
    payload: JsonPayload,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    _require_open_period(conn, payload.period)

    created: List[int] = []
    failed: List[Dict[str, Any]] = []
    seen_targets: set = set()

    known_ids = {
        r["student_id"]
        for r in conn.execute("SELECT student_id FROM permitted_users").fetchall()
    }

    try:
        conn.execute("BEGIN IMMEDIATE")
        for idx, entry in enumerate(payload.entries):
            err: Optional[str] = None
            if entry.target_student_id not in known_ids:
                err = "target_not_found"
            elif entry.target_student_id in seen_targets:
                err = "duplicate_target_in_batch"
            if err is not None:
                failed.append({"index": idx, "target_student_id": entry.target_student_id, "error": err})
                continue
            seen_targets.add(entry.target_student_id)
            submission_id = _insert_submission(
                conn,
                request,
                user.actor_id,
                payload.period,
                entry.target_student_id,
                entry.scores.model_dump(),
                entry.comment,
                "",
                "json_upload_batch",
            )
            created.append(submission_id)
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise

    log_event(
        conn,
        request,
        "upload_json_batch",
        "student",
        user.actor_id,
        {"period": payload.period, "created": len(created), "failed_count": len(failed)},
    )
    return {"created": created, "failed": failed}


# ─── JSON downloads ─────────────────────────────────────────────────────

def _filename(period: str, grader_id: str, suffix: str) -> str:
    from datetime import datetime

    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    return f'evaluation_{period}_{grader_id}_{ts}{suffix}.json'


def _to_entry(row: sqlite3.Row, target_name: str) -> Dict[str, Any]:
    return {
        "target_student_id": row["target_student_id"],
        "target_name": target_name,
        "scores": {
            "topic": row["score_topic"],
            "content": row["score_content"],
            "narrative": row["score_narrative"],
            "presentation": row["score_presentation"],
            "teamwork": row["score_teamwork"],
        },
        "comment": row["comment"],
    }


@router.get("/submissions/{period}/{target_id}.json")
def download_single(
    period: str,
    target_id: str,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    target = _require_target(conn, target_id)
    latest = conn.execute(
        "SELECT * FROM latest_submissions "
        "WHERE period_code = ? AND grader_student_id = ? AND target_student_id = ?",
        (period, user.actor_id, target_id),
    ).fetchone()
    entries = [_to_entry(latest, target["name"])] if latest is not None else [
        {
            "target_student_id": target_id,
            "target_name": target["name"],
            "scores": {"topic": 0, "content": 0, "narrative": 0, "presentation": 0, "teamwork": 0},
            "comment": "",
        }
    ]
    payload = {"period": period, "entries": entries}
    log_event(conn, request, "download_json_single", "student", user.actor_id,
              {"period": period, "target_id": target_id})
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition":
                f'attachment; filename="{_filename(period, user.actor_id, f"_{target_id}")}"',
        },
    )


@router.get("/submissions/{period}.json")
def download_period(
    period: str,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("student")),
):
    if _period_row(conn, period) is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    rows = conn.execute(
        "SELECT ls.*, pu.name AS target_name FROM latest_submissions ls "
        "JOIN permitted_users pu ON pu.student_id = ls.target_student_id "
        "WHERE ls.period_code = ? AND ls.grader_student_id = ?",
        (period, user.actor_id),
    ).fetchall()
    payload = {
        "period": period,
        "entries": [_to_entry(r, r["target_name"]) for r in rows],
    }
    log_event(conn, request, "download_json_batch", "student", user.actor_id,
              {"period": period, "count": len(rows)})
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition":
                 f'attachment; filename="{_filename(period, user.actor_id, "")}"'},
    )
