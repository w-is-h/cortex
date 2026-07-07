import sqlite3

from ..auth import now
from ..errors import NotFound
from . import statuses


def list_spaces(db: sqlite3.Connection) -> list[dict]:
    return [dict(r) for r in db.execute("SELECT * FROM spaces ORDER BY id")]


def get(db: sqlite3.Connection, space_id: int) -> dict:
    row = db.execute("SELECT * FROM spaces WHERE id = ?", (space_id,)).fetchone()
    if row is None:
        raise NotFound("space not found")
    return dict(row)


def create(db: sqlite3.Connection, name: str) -> dict:
    cur = db.execute("INSERT INTO spaces (name, created_at) VALUES (?, ?)", (name, now()))
    statuses.seed_defaults(db, cur.lastrowid)
    return get(db, cur.lastrowid)


def update(db: sqlite3.Connection, space_id: int, **fields) -> dict:
    get(db, space_id)
    for key in ("name", "default_sprint_days"):
        if fields.get(key) is not None:
            db.execute(f"UPDATE spaces SET {key} = ? WHERE id = ?", (fields[key], space_id))
    return get(db, space_id)
