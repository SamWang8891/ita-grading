from __future__ import annotations

from tests.conftest import login_admin, login_student, login_teacher, seed


def test_student_identify_creates_session(app_client):
    seed(app_client)
    r = app_client.post("/api/auth/identify", json={"identifier": "B001"})
    assert r.status_code == 200
    data = r.json()
    assert data["role"] == "student"
    assert data["need_password"] is False
    assert data["actor_id"] == "B001"
    me = app_client.get("/api/auth/me").json()
    assert me["role"] == "student"
    assert me["actor_id"] == "B001"


def test_unknown_identifier_404(app_client):
    seed(app_client)
    r = app_client.post("/api/auth/identify", json={"identifier": "nope"})
    assert r.status_code == 404


def test_teacher_password_flow(app_client):
    seed(app_client)
    r = app_client.post("/api/auth/identify", json={"identifier": "t1"})
    assert r.json() == {"role": "teacher", "need_password": True}
    assert app_client.post("/api/auth/password",
                           json={"identifier": "t1", "password": "wrong"}).status_code == 401
    ok = app_client.post("/api/auth/password", json={"identifier": "t1", "password": "tpw"})
    assert ok.status_code == 200
    assert app_client.get("/api/auth/me").json()["role"] == "teacher"


def test_admin_password_flow(app_client):
    seed(app_client)
    login_admin(app_client)
    assert app_client.get("/api/auth/me").json()["role"] == "admin"


def test_logout_clears_session(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    assert app_client.get("/api/auth/me").status_code == 200
    r = app_client.post("/api/auth/logout")
    assert r.status_code == 204
    assert app_client.get("/api/auth/me").status_code == 401


def test_role_guard_denies_others(app_client):
    seed(app_client)
    login_student(app_client, "B001")
    assert app_client.get("/api/admin/students").status_code == 403
    assert app_client.get("/api/teacher/overview?period=midterm").status_code == 403


def test_rate_limit_blocks_after_threshold(app_client):
    seed(app_client)
    codes = []
    for _ in range(25):
        r = app_client.post("/api/auth/identify", json={"identifier": "nope"})
        codes.append(r.status_code)
    assert 429 in codes
    assert codes.count(429) >= 5
