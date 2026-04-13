from __future__ import annotations

import json

from tests.conftest import login_student, seed


def test_batch_partial_success_and_errors(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    payload = {
        "period": "midterm",
        "entries": [
            {"target_student_id": "B002",
             "scores": {"topic": 20, "content": 20, "narrative": 10, "presentation": 5, "teamwork": 5},
             "comment": "good"},
            {"target_student_id": "B002",  # duplicate
             "scores": {"topic": 25, "content": 20, "narrative": 10, "presentation": 5, "teamwork": 5},
             "comment": "dup"},
            {"target_student_id": "B001",  # self
             "scores": {"topic": 20, "content": 20, "narrative": 10, "presentation": 5, "teamwork": 5},
             "comment": "self"},
            {"target_student_id": "ZZZ",   # unknown
             "scores": {"topic": 20, "content": 20, "narrative": 10, "presentation": 5, "teamwork": 5},
             "comment": "unknown"},
        ],
    }
    r = app_client.post("/api/student/submissions/batch", json=payload)
    assert r.status_code == 200
    data = r.json()
    assert len(data["created"]) == 1
    errors = {f["error"] for f in data["failed"]}
    assert errors == {"duplicate_target_in_batch", "cannot_grade_self", "target_not_found"}


def test_download_single_json_roundtrip_unicode_and_emoji(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    app_client.post("/api/student/submissions", json={
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 30, "content": 30, "narrative": 20, "presentation": 10, "teamwork": 10},
        "comment": 'Hello 你好 "引號" 🎉', "self_note": "hidden",
    })
    r = app_client.get("/api/student/submissions/midterm/B002.json")
    assert r.status_code == 200
    assert 'application/json' in r.headers["content-type"]
    # Content-Disposition should name the file
    assert 'filename="' in r.headers["content-disposition"]
    parsed = json.loads(r.text)
    assert parsed["period"] == "midterm"
    entry = parsed["entries"][0]
    assert entry["target_student_id"] == "B002"
    assert entry["scores"]["topic"] == 30
    # JSON download MUST NOT contain self_note
    assert "self_note" not in entry
    assert entry["comment"] == 'Hello 你好 "引號" 🎉'


def test_download_period_json_contains_all_latest(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    for target in ("B002", "B003"):
        app_client.post("/api/student/submissions", json={
            "period": "midterm", "target_student_id": target,
            "scores": {"topic": 20, "content": 20, "narrative": 10, "presentation": 5, "teamwork": 5},
            "comment": f"comment-{target}", "self_note": "x",
        })
    r = app_client.get("/api/student/submissions/midterm.json")
    data = json.loads(r.text)
    ids = sorted(e["target_student_id"] for e in data["entries"])
    assert ids == ["B002", "B003"]
    for e in data["entries"]:
        assert "self_note" not in e
