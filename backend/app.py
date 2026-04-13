"""FastAPI entry point. Loads .env, applies migrations, mounts routers."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).resolve().parent / ".env")

from db import init_db  # noqa: E402
from routers import admin as admin_router  # noqa: E402
from routers import auth as auth_router  # noqa: E402
from routers import student as student_router  # noqa: E402
from routers import teacher as teacher_router  # noqa: E402


def _parse_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def create_app() -> FastAPI:
    init_db()
    app = FastAPI(title="ITA Peer Grading", version="0.1.0")

    origins = _parse_origins(os.environ.get("ALLOWED_ORIGINS"))
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["Content-Type", "Authorization"],
            expose_headers=["Content-Disposition"],
            max_age=600,
        )

    app.include_router(auth_router.router)
    app.include_router(student_router.router)
    app.include_router(teacher_router.router)
    app.include_router(admin_router.router)

    @app.get("/api/health")
    def _health() -> "dict[str, object]":
        return {"status": "ok", "cookie_secure": os.environ.get("COOKIE_SECURE", "0") == "1"}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", "8000")),
        reload=os.environ.get("RELOAD", "1") == "1",
    )
