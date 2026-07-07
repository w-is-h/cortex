import sqlite3
from datetime import date, timedelta

from ..auth import now
from ..errors import CortexError, NotFound
from . import spaces

# a sprint auto-archives this long after its end date, unless manually overridden
ARCHIVE_AFTER_DAYS = 7


def _with_current(row: sqlite3.Row) -> dict:
    d = dict(row)
    today = date.today()
    d["is_current"] = d["start_date"] <= today.isoformat() <= d["end_date"]
    auto = date.fromisoformat(d["end_date"]) + timedelta(days=ARCHIVE_AFTER_DAYS) < today
    override = d.pop("archived_override", None)
    d["archived"] = bool(override) if override is not None else auto
    return d


def list_sprints(db: sqlite3.Connection, space_id: int) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM sprints WHERE space_id = ? ORDER BY start_date DESC, id DESC",
        (space_id,),
    )
    return [_with_current(r) for r in rows]


def get(db: sqlite3.Connection, sprint_id: int) -> dict:
    row = db.execute("SELECT * FROM sprints WHERE id = ?", (sprint_id,)).fetchone()
    if row is None:
        raise NotFound("sprint not found")
    return _with_current(row)


def create(db: sqlite3.Connection, space_id: int, name: str,
           start_date: date, end_date: date) -> dict:
    spaces.get(db, space_id)
    if end_date < start_date:
        raise CortexError("end_date is before start_date")
    cur = db.execute(
        "INSERT INTO sprints (space_id, name, start_date, end_date, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (space_id, name, start_date.isoformat(), end_date.isoformat(), now()),
    )
    return get(db, cur.lastrowid)


def update(db: sqlite3.Connection, sprint_id: int, **fields) -> dict:
    get(db, sprint_id)
    for key in ("name", "start_date", "end_date"):
        value = fields.get(key)
        if value is not None:
            if isinstance(value, date):
                value = value.isoformat()
            db.execute(f"UPDATE sprints SET {key} = ? WHERE id = ?", (value, sprint_id))
    if "archived" in fields and fields["archived"] is not None:
        db.execute("UPDATE sprints SET archived_override = ? WHERE id = ?",
                   (1 if fields["archived"] else 0, sprint_id))
    updated = get(db, sprint_id)
    if updated["end_date"] < updated["start_date"]:
        raise CortexError("end_date is before start_date")
    return updated


def delete(db: sqlite3.Connection, sprint_id: int) -> None:
    get(db, sprint_id)
    db.execute("UPDATE tasks SET sprint_id = NULL WHERE sprint_id = ?", (sprint_id,))
    db.execute("DELETE FROM sprints WHERE id = ?", (sprint_id,))
