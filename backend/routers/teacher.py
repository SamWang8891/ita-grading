"""Teacher routes: overview, student detail (no self_note), Excel / JSON export."""
from __future__ import annotations

import io
import json
import sqlite3
from statistics import mean, median
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from auth import CurrentUser, hash_password, require_role, verify_password
from db import get_db
from models import TeacherPasswordChangeIn
from routers.common import log_event
from services.excel_export import build_workbook

router = APIRouter(prefix="/api/teacher", tags=["teacher"])


def _total_from(row: sqlite3.Row) -> int:
    return (
        row["score_topic"]
        + row["score_content"]
        + row["score_narrative"]
        + row["score_presentation"]
        + row["score_teamwork"]
    )


def _strip_self(row: sqlite3.Row) -> Dict[str, Any]:
    out = dict(row)
    out.pop("self_note", None)
    out["total"] = _total_from(row)
    return out


@router.get("/overview")
def overview(
    period: str = Query(..., min_length=1, max_length=32),
    request: Request = None,  # type: ignore[assignment]
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("teacher")),
):
    if conn.execute("SELECT 1 FROM evaluation_periods WHERE code = ?", (period,)).fetchone() is None:
        raise HTTPException(status_code=404, detail="period_not_found")

    students = conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users ORDER BY student_id"
    ).fetchall()
    rows = conn.execute(
        "SELECT ls.*, gu.name AS grader_name, gu.class_name AS grader_class "
        "FROM latest_submissions ls "
        "JOIN permitted_users gu ON gu.student_id = ls.grader_student_id "
        "WHERE ls.period_code = ?",
        (period,),
    ).fetchall()

    by_target: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        entry = _strip_self(row)
        entry["grader_name"] = row["grader_name"]
        entry["grader_class"] = row["grader_class"]
        by_target.setdefault(row["target_student_id"], []).append(entry)

    out: List[Dict[str, Any]] = []
    for s in students:
        received = by_target.get(s["student_id"], [])
        totals = [r["total"] for r in received]
        stats = {
            "count": len(totals),
            "average": round(mean(totals), 2) if totals else None,
            "median": median(totals) if totals else None,
            "max": max(totals) if totals else None,
            "min": min(totals) if totals else None,
        }
        out.append(
            {
                "student_id": s["student_id"],
                "name": s["name"],
                "class_name": s["class_name"],
                "received": received,
                "stats": stats,
            }
        )
    log_event(conn, request, "teacher_view_overview", "teacher", user.actor_id, {"period": period})
    return out


@router.get("/student/{sid}")
def student_detail(
    sid: str,
    period: str = Query(..., min_length=1, max_length=32),
    request: Request = None,  # type: ignore[assignment]
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("teacher")),
):
    if conn.execute("SELECT 1 FROM evaluation_periods WHERE code = ?", (period,)).fetchone() is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    student = conn.execute(
        "SELECT student_id, name, class_name FROM permitted_users WHERE student_id = ?", (sid,)
    ).fetchone()
    if student is None:
        raise HTTPException(status_code=404, detail="student_not_found")

    received = conn.execute(
        "SELECT ls.*, gu.name AS grader_name, gu.class_name AS grader_class "
        "FROM latest_submissions ls "
        "JOIN permitted_users gu ON gu.student_id = ls.grader_student_id "
        "WHERE ls.period_code = ? AND ls.target_student_id = ?",
        (period, sid),
    ).fetchall()
    given = conn.execute(
        "SELECT ls.*, tu.name AS target_name, tu.class_name AS target_class "
        "FROM latest_submissions ls "
        "JOIN permitted_users tu ON tu.student_id = ls.target_student_id "
        "WHERE ls.period_code = ? AND ls.grader_student_id = ?",
        (period, sid),
    ).fetchall()

    def pack(rs: List[sqlite3.Row], extra_key: str) -> List[Dict[str, Any]]:
        result = []
        for r in rs:
            d = _strip_self(r)
            d[extra_key] = r[extra_key]
            d[extra_key.replace("_name", "_class")] = r[extra_key.replace("_name", "_class")]
            result.append(d)
        return result

    return {
        "student": dict(student),
        "received": pack(received, "grader_name"),
        "given": pack(given, "target_name"),
    }


@router.get("/export.json")
def export_json(
    period: str = Query(..., min_length=1, max_length=32),
    request: Request = None,  # type: ignore[assignment]
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("teacher")),
):
    if conn.execute("SELECT 1 FROM evaluation_periods WHERE code = ?", (period,)).fetchone() is None:
        raise HTTPException(status_code=404, detail="period_not_found")
    rows = conn.execute(
        "SELECT ls.*, gu.name AS grader_name, gu.class_name AS grader_class,"
        "       tu.name AS target_name, tu.class_name AS target_class "
        "FROM latest_submissions ls "
        "JOIN permitted_users gu ON gu.student_id = ls.grader_student_id "
        "JOIN permitted_users tu ON tu.student_id = ls.target_student_id "
        "WHERE ls.period_code = ?",
        (period,),
    ).fetchall()
    data = []
    for r in rows:
        data.append(
            {
                "period": r["period_code"],
                "grader_student_id": r["grader_student_id"],
                "grader_name": r["grader_name"],
                "grader_class": r["grader_class"],
                "target_student_id": r["target_student_id"],
                "target_name": r["target_name"],
                "target_class": r["target_class"],
                "scores": {
                    "topic": r["score_topic"],
                    "content": r["score_content"],
                    "narrative": r["score_narrative"],
                    "presentation": r["score_presentation"],
                    "teamwork": r["score_teamwork"],
                    "total": _total_from(r),
                },
                "comment": r["comment"],
                "submitted_at": r["submitted_at"],
            }
        )
    log_event(conn, request, "teacher_export_json", "teacher", user.actor_id, {"period": period})
    return Response(
        content=json.dumps(data, ensure_ascii=False, indent=2),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="export_{period}.json"',
        },
    )


@router.get("/export.xlsx")
def export_xlsx(
    period: str = Query(..., min_length=1, max_length=32),
    request: Request = None,  # type: ignore[assignment]
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("teacher")),
):
    if conn.execute("SELECT 1 FROM evaluation_periods WHERE code = ?", (period,)).fetchone() is None:
        raise HTTPException(status_code=404, detail="period_not_found")

    wb = build_workbook(conn, period)
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    log_event(conn, request, "teacher_export_excel", "teacher", user.actor_id, {"period": period})
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="export_{period}.xlsx"'},
    )


@router.get("/activity")
def my_activity(
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("teacher")),
):
    rows = conn.execute(
        "SELECT id, event_type, ip, ua, ts, detail_json FROM activity_log"
        " WHERE actor_id = ? AND actor_role = 'teacher' ORDER BY id DESC LIMIT 500",
        (user.actor_id,),
    ).fetchall()
    log_event(conn, request, "view_own_records", "teacher", user.actor_id, {})
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


@router.post("/password")
def change_password(
    body: TeacherPasswordChangeIn,
    request: Request,
    conn: sqlite3.Connection = Depends(get_db),
    user: CurrentUser = Depends(require_role("teacher")),
):
    row = conn.execute(
        "SELECT password_hash FROM teacher_accounts WHERE username = ?", (user.actor_id,)
    ).fetchone()
    if row is None or not verify_password(body.old_password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="bad_password")
    conn.execute(
        "UPDATE teacher_accounts SET password_hash = ? WHERE username = ?",
        (hash_password(body.new_password), user.actor_id),
    )
    log_event(conn, request, "teacher_change_password", "teacher", user.actor_id, {})
    return {"ok": True}
