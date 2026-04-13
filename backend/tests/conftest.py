"""Shared fixtures. Uses a tempfile DB and resets the login rate limiter per test."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Iterator

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("ADMIN_USERNAME", "admin")
os.environ.setdefault("ADMIN_PASSWORD", "admin-pw")
os.environ.setdefault("COOKIE_SECURE", "0")

import sys
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import db as _db
from auth import hash_password, login_limiter


@pytest.fixture()
def app_client(tmp_path: Path) -> Iterator[TestClient]:
    db_file = tmp_path / "test.db"
    _db.set_db_path(str(db_file))
    _db.init_db()
    login_limiter.reset()

    import importlib
    import app as _app
    importlib.reload(_app)
    client = TestClient(_app.app)
    try:
        yield client
    finally:
        client.close()
        _db.set_db_path(None)
        login_limiter.reset()


def seed(client: TestClient, students=("B001", "B002", "B003"), teacher="t1", teacher_pw="tpw", open_midterm=True) -> None:
    with _db.connect() as c:
        for sid in students:
            c.execute("INSERT INTO permitted_users (student_id, name, class_name) VALUES (?, ?, ?)",
                      (sid, f"Name-{sid}", "A"))
        c.execute("INSERT INTO teacher_accounts (username, password_hash, display_name) VALUES (?, ?, ?)",
                  (teacher, hash_password(teacher_pw), f"Teacher {teacher}"))
        if open_midterm:
            c.execute("UPDATE evaluation_periods SET is_open = 1 WHERE code = 'midterm'")


def login_student(client: TestClient, sid: str) -> TestClient:
    r = client.post("/api/auth/identify", json={"identifier": sid})
    assert r.status_code == 200, r.text
    return client


def login_teacher(client: TestClient, username: str, password: str) -> TestClient:
    r = client.post("/api/auth/password", json={"identifier": username, "password": password})
    assert r.status_code == 200, r.text
    return client


def login_admin(client: TestClient) -> TestClient:
    r = client.post("/api/auth/password",
                    json={"identifier": os.environ["ADMIN_USERNAME"], "password": os.environ["ADMIN_PASSWORD"]})
    assert r.status_code == 200, r.text
    return client
