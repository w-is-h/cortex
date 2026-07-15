"""SQLite connection handling and migration runner."""

import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from fastapi import Request

from .migrations import MIGRATIONS


def data_dir() -> Path:
    default = Path(__file__).resolve().parents[2] / "data"
    return Path(os.environ.get("CORTEX_DATA_DIR", default))


def uploads_dir() -> Path:
    return data_dir() / "uploads"


def connect() -> sqlite3.Connection:
    data_dir().mkdir(parents=True, exist_ok=True)
    # check_same_thread=False: FastAPI may run a dependency's setup and its
    # endpoint on different threadpool workers; access is still sequential.
    conn = sqlite3.connect(data_dir() / "cortex.db", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn


def migrate() -> None:
    conn = connect()
    try:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for i, script in enumerate(MIGRATIONS[version:], start=version + 1):
            conn.executescript(script)
            conn.execute(f"PRAGMA user_version = {i}")
            conn.commit()
    finally:
        conn.close()


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """Connection per unit of work: commit on success, rollback on error."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_db(request: Request) -> sqlite3.Connection:
    """FastAPI dependency: the per-request connection owned by DbPerRequest."""
    return request.state.db


class DbPerRequest:
    """ASGI middleware owning one connection per /api request.

    A yield-dependency would commit in teardown, after the response reaches
    the client — a fast client's next request can then read pre-commit state.
    Here the commit happens before http.response.start is forwarded, so any
    response the client sees is already durable. Error responses and raised
    exceptions roll back, matching transaction().
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api"):
            await self.app(scope, receive, send)
            return
        conn = connect()
        scope.setdefault("state", {})["db"] = conn

        async def send_settled(message):
            if message["type"] == "http.response.start":
                if message["status"] < 400:
                    conn.commit()
                else:
                    conn.rollback()
            await send(message)

        try:
            await self.app(scope, receive, send_settled)
        except BaseException:
            conn.rollback()
            raise
        finally:
            conn.close()
