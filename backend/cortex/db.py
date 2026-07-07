"""SQLite connection handling and migration runner."""

import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

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


def get_db() -> Iterator[sqlite3.Connection]:
    """FastAPI dependency: connection per request, commit on success."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    finally:
        conn.close()
