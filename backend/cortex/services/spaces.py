import sqlite3

from ..auth import now
from ..errors import Conflict, NotFound


def list_spaces(db: sqlite3.Connection) -> list[dict]:
    return [dict(r) for r in db.execute("SELECT * FROM spaces ORDER BY id")]


def get(db: sqlite3.Connection, space_id: int) -> dict:
    row = db.execute("SELECT * FROM spaces WHERE id = ?", (space_id,)).fetchone()
    if row is None:
        raise NotFound("space not found")
    return dict(row)


def create(db: sqlite3.Connection, name: str) -> dict:
    cur = db.execute("INSERT INTO spaces (name, created_at) VALUES (?, ?)", (name, now()))
    return get(db, cur.lastrowid)


def update(db: sqlite3.Connection, space_id: int, **fields) -> dict:
    get(db, space_id)
    for key in ("name", "default_sprint_days"):
        if fields.get(key) is not None:
            db.execute(f"UPDATE spaces SET {key} = ? WHERE id = ?", (fields[key], space_id))
    return get(db, space_id)


def delete(db: sqlite3.Connection, space_id: int) -> None:
    """Delete a space and everything in it. Comments are polymorphic (no FK), so they
    go explicitly; task/project deletes cascade to blocks, activity and notifications."""
    get(db, space_id)
    if db.execute("SELECT COUNT(*) FROM spaces").fetchone()[0] == 1:
        raise Conflict("cannot delete the last space")
    db.execute("""DELETE FROM comments
                  WHERE (parent_type = 'task'
                         AND parent_id IN (SELECT id FROM tasks WHERE space_id = ?))
                     OR (parent_type = 'project'
                         AND parent_id IN (SELECT id FROM projects WHERE space_id = ?))""",
               (space_id, space_id))
    db.execute("DELETE FROM tasks WHERE space_id = ?", (space_id,))
    db.execute("DELETE FROM projects WHERE space_id = ?", (space_id,))
    db.execute("DELETE FROM sprints WHERE space_id = ?", (space_id,))
    db.execute("DELETE FROM spaces WHERE id = ?", (space_id,))
