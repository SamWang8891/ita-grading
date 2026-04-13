from __future__ import annotations

from tests.conftest import login_admin, login_student, seed


def test_add_edit_student(app_client):
    seed(app_client)
    login_admin(app_client)
    r = app_client.post("/api/admin/students",
                        json={"student_id": "B004", "name": "N4", "class_name": "B"})
    assert r.status_code == 201
    # duplicate
    r2 = app_client.post("/api/admin/students",
                         json={"student_id": "B004", "name": "N4", "class_name": "B"})
    assert r2.status_code == 409
    # patch name
    r3 = app_client.patch("/api/admin/students/B004", json={"name": "Renamed"})
    assert r3.status_code == 200
    assert r3.json()["name"] == "Renamed"


def test_delete_requires_no_submissions(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    app_client.post("/api/student/submissions", json={
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 10, "content": 10, "narrative": 5, "presentation": 2, "teamwork": 2},
        "comment": "", "self_note": "",
    })
    app_client.post("/api/auth/logout")
    login_admin(app_client)
    impact_for_target = app_client.get("/api/admin/students/B002/impact").json()
    assert impact_for_target == {"submission_count": 1, "can_delete": False}
    impact_for_clean = app_client.get("/api/admin/students/B003/impact").json()
    assert impact_for_clean["can_delete"] is True

    r = app_client.delete("/api/admin/students/B002")
    assert r.status_code == 409
    r_ok = app_client.delete("/api/admin/students/B003")
    assert r_ok.status_code == 204


def test_period_toggle_blocks_writes(app_client):
    seed(app_client)
    login_admin(app_client)
    app_client.patch("/api/admin/periods/midterm", json={"is_open": False})
    app_client.post("/api/auth/logout")
    login_student(app_client, "B001")
    r = app_client.post("/api/student/submissions", json={
        "period": "midterm", "target_student_id": "B002",
        "scores": {"topic": 10, "content": 10, "narrative": 5, "presentation": 2, "teamwork": 2},
        "comment": "", "self_note": "",
    })
    assert r.status_code == 409


def test_admin_teacher_crud(app_client):
    seed(app_client)
    login_admin(app_client)
    r = app_client.post("/api/admin/teachers",
                        json={"username": "t2", "display_name": "T2", "initial_password": "pw2!"})
    assert r.status_code == 201
    assert any(t["username"] == "t2" for t in app_client.get("/api/admin/teachers").json())
    app_client.post("/api/admin/teachers/t2/password", json={"new_password": "pw3!!"})
    app_client.post("/api/auth/logout")
    bad = app_client.post("/api/auth/password", json={"identifier": "t2", "password": "pw2!"})
    assert bad.status_code == 401
    ok = app_client.post("/api/auth/password", json={"identifier": "t2", "password": "pw3!!"})
    assert ok.status_code == 200
    # admin deletes teacher
    app_client.post("/api/auth/logout")
    login_admin(app_client)
    assert app_client.delete("/api/admin/teachers/t2").status_code == 204
