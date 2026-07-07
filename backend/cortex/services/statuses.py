import re
import sqlite3

from ..errors import Conflict, CortexError, NotFound

# defaults seeded for every new space (kept in sync with migration v4)
DEFAULTS: dict[str, list[tuple]] = {
    "task": [
        ("todo", "To do", "#8b949e", 0),
        ("in_progress", "In progress", "#58a6ff", 0),
        ("done", "Done", "#3fb950", 1),
    ],
    "project": [
        ("scoping", "Scoping", "#a371f7", 0),
        ("poc", "PoC", "#e3b341", 0),
        ("development", "Development", "#58a6ff", 0),
        ("live", "Live", "#3fb950", 1),
    ],
}


def _row(r: sqlite3.Row) -> dict:
    d = dict(r)
    d["is_done"] = bool(d["is_done"])
    return d


def seed_defaults(db: sqlite3.Connection, space_id: int) -> None:
    for kind, rows in DEFAULTS.items():
        for i, (key, label, color, is_done) in enumerate(rows):
            db.execute(
                "INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (space_id, kind, key, label, color, i, is_done),
            )


def list_statuses(db: sqlite3.Connection, space_id: int, kind: str | None = None) -> list[dict]:
    if kind:
        rows = db.execute(
            "SELECT * FROM statuses WHERE space_id = ? AND kind = ? ORDER BY sort_order, id",
            (space_id, kind),
        )
    else:
        rows = db.execute(
            "SELECT * FROM statuses WHERE space_id = ? ORDER BY kind, sort_order, id", (space_id,)
        )
    return [_row(r) for r in rows]


def get(db: sqlite3.Connection, status_id: int) -> dict:
    row = db.execute("SELECT * FROM statuses WHERE id = ?", (status_id,)).fetchone()
    if row is None:
        raise NotFound("status not found")
    return _row(row)


def _slug(label: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")
    return s or "status"


def create(db: sqlite3.Connection, space_id: int, kind: str, label: str,
           color: str = "#8b949e", is_done: bool = False) -> dict:
    if kind not in ("task", "project"):
        raise CortexError("kind must be 'task' or 'project'")
    base = _slug(label)
    existing = {r["key"] for r in db.execute(
        "SELECT key FROM statuses WHERE space_id = ? AND kind = ?", (space_id, kind))}
    key = base
    n = 2
    while key in existing:
        key = f"{base}_{n}"
        n += 1
    order = (db.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM statuses WHERE space_id = ? AND kind = ?",
        (space_id, kind)).fetchone()[0])
    cur = db.execute(
        "INSERT INTO statuses (space_id, kind, key, label, color, sort_order, is_done) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (space_id, kind, key, label, color, order, int(is_done)),
    )
    return get(db, cur.lastrowid)


def update(db: sqlite3.Connection, status_id: int, **fields) -> dict:
    get(db, status_id)
    for key in ("label", "color", "sort_order", "is_done"):
        if key in fields and fields[key] is not None:
            value = int(fields[key]) if key == "is_done" else fields[key]
            db.execute(f"UPDATE statuses SET {key} = ? WHERE id = ?", (value, status_id))
    return get(db, status_id)


def remove(db: sqlite3.Connection, status_id: int, reassign_to: int | None = None) -> None:
    status = get(db, status_id)
    space_id, kind, key = status["space_id"], status["kind"], status["key"]
    count = db.execute(
        "SELECT COUNT(*) FROM statuses WHERE space_id = ? AND kind = ?", (space_id, kind)
    ).fetchone()[0]
    if count <= 1:
        raise CortexError("cannot remove the last status")

    table = "tasks" if kind == "task" else "projects"
    in_use = db.execute(
        f"SELECT COUNT(*) FROM {table} WHERE space_id = ? AND status = ?", (space_id, key)
    ).fetchone()[0]
    if in_use:
        if reassign_to is None:
            raise Conflict(f"{in_use} {table} still use this status; pass reassign_to")
        target = get(db, reassign_to)
        if target["space_id"] != space_id or target["kind"] != kind:
            raise CortexError("reassign_to must be a status of the same space and kind")
        db.execute(f"UPDATE {table} SET status = ? WHERE space_id = ? AND status = ?",
                   (target["key"], space_id, key))
    db.execute("DELETE FROM statuses WHERE id = ?", (status_id,))
