from __future__ import annotations

from tests.conftest import login_admin, login_student, seed


def _post(client, body):
    return client.post("/api/student/submissions", json=body)


def test_submit_and_history_new_version_per_send(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    base = {
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 20, "content": 20, "narrative": 10, "presentation": 5, "teamwork": 5},
        "comment": "v1", "self_note": "mine",
    }
    r1 = _post(app_client, base)
    assert r1.status_code == 200
    next_body = {**base, "scores": {"topic": 30, "content": 30, "narrative": 20, "presentation": 10, "teamwork": 10},
                 "comment": "v2"}
    r2 = _post(app_client, next_body)
    assert r2.status_code == 200

    detail = app_client.get("/api/student/submissions/midterm/B002/detail").json()
    assert detail["latest"]["total"] == 100
    assert [v["comment"] for v in detail["versions"]] == ["v2", "v1"]


def test_cannot_grade_self(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    r = _post(app_client, {
        "period": "midterm", "target_student_id": "B001",
        "scores": {"topic": 10, "content": 10, "narrative": 5, "presentation": 3, "teamwork": 3},
        "comment": "", "self_note": "",
    })
    assert r.status_code == 422


def test_closed_period_rejects_writes(app_client):
    seed(app_client, open_midterm=False)
    login_student(app_client, "B001")
    r = _post(app_client, {
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 10, "content": 10, "narrative": 5, "presentation": 3, "teamwork": 3},
        "comment": "", "self_note": "",
    })
    assert r.status_code == 409
    assert r.json()["detail"] == "period_closed"


def test_score_range_validation(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    r = _post(app_client, {
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 31, "content": 0, "narrative": 0, "presentation": 0, "teamwork": 0},
        "comment": "", "self_note": "",
    })
    assert r.status_code == 422


def test_targets_marks_evaluated(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    _post(app_client, {
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 10, "content": 10, "narrative": 10, "presentation": 5, "teamwork": 5},
        "comment": "", "self_note": "",
    })
    targets = app_client.get("/api/student/targets?period=midterm").json()
    ids = {t["student_id"]: t for t in targets}
    assert "B001" not in ids  # excludes self
    assert ids["B002"]["evaluated"] is True
    assert ids["B002"]["total"] == 40
    assert ids["B003"]["evaluated"] is False
