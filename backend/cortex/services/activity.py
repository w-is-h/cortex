import json
import sqlite3

from ..auth import User, now


def record(db: sqlite3.Connection, actor: User, task_id: int,
           type_: str, detail: dict | None = None) -> None:
    db.execute(
        "INSERT INTO activity (task_id, actor_id, type, detail, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (task_id, actor.id, type_, json.dumps(detail or {}), now()),
    )


def list_for_task(db: sqlite3.Connection, task_id: int) -> list[dict]:
    rows = db.execute(
        """SELECT a.*, u.username AS actor_username FROM activity a
           JOIN users u ON u.id = a.actor_id
           WHERE a.task_id = ? ORDER BY a.created_at, a.id""",
        (task_id,),
    )
    out = []
    for r in rows:
        d = dict(r)
        d["detail"] = json.loads(d["detail"])
        out.append(d)
    return out
