import sqlite3

from ..auth import User, now
from ..errors import CortexError, Forbidden, NotFound
from . import notifications

EMOJI = ("👍", "👎", "❤️", "🎉", "😄", "🚀", "👀")


def _check_parent(db: sqlite3.Connection, parent_type: str, parent_id: int):
    table = "tasks" if parent_type == "task" else "projects"
    if db.execute(f"SELECT 1 FROM {table} WHERE id = ?", (parent_id,)).fetchone() is None:
        raise NotFound(f"{parent_type} not found")


def _reactions(db: sqlite3.Connection, comment_id: int) -> list[dict]:
    rows = db.execute(
        "SELECT emoji, user_id FROM reactions WHERE comment_id = ? ORDER BY emoji",
        (comment_id,),
    ).fetchall()
    agg: dict[str, list[int]] = {}
    for r in rows:
        agg.setdefault(r["emoji"], []).append(r["user_id"])
    return [{"emoji": e, "count": len(u), "user_ids": u} for e, u in agg.items()]


def _out(db: sqlite3.Connection, row: sqlite3.Row) -> dict:
    d = dict(row)
    d["reactions"] = _reactions(db, d["id"])
    return d


def get(db: sqlite3.Connection, comment_id: int) -> dict:
    row = db.execute(
        """SELECT c.*, u.username AS author_username FROM comments c
           JOIN users u ON u.id = c.author_id WHERE c.id = ?""", (comment_id,)
    ).fetchone()
    if row is None:
        raise NotFound("comment not found")
    return _out(db, row)


def list_for(db: sqlite3.Connection, parent_type: str, parent_id: int) -> list[dict]:
    rows = db.execute(
        """SELECT c.*, u.username AS author_username FROM comments c
           JOIN users u ON u.id = c.author_id
           WHERE c.parent_type = ? AND c.parent_id = ?
           ORDER BY c.created_at, c.id""",
        (parent_type, parent_id),
    )
    return [_out(db, r) for r in rows]


def create(db: sqlite3.Connection, actor: User,
           parent_type: str, parent_id: int, body: str) -> dict:
    _check_parent(db, parent_type, parent_id)
    cur = db.execute(
        "INSERT INTO comments (parent_type, parent_id, author_id, body, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (parent_type, parent_id, actor.id, body, now()),
    )
    comment_id = cur.lastrowid
    task_id = parent_id if parent_type == "task" else None
    project_id = parent_id if parent_type == "project" else None
    if task_id is not None:
        assignee = db.execute(
            "SELECT assignee_id FROM tasks WHERE id = ?", (task_id,)).fetchone()[0]
        notifications.notify(db, assignee, "commented", actor,
                             task_id=task_id, comment_id=comment_id)
    notifications.notify_mentions(db, actor, body, task_id=task_id,
                                  project_id=project_id, comment_id=comment_id)
    return get(db, comment_id)


def add_reaction(db: sqlite3.Connection, actor: User, comment_id: int, emoji: str) -> dict:
    get(db, comment_id)
    if emoji not in EMOJI:
        raise CortexError(f"emoji must be one of {' '.join(EMOJI)}")
    db.execute("INSERT OR IGNORE INTO reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)",
               (comment_id, actor.id, emoji))
    return get(db, comment_id)


def remove_reaction(db: sqlite3.Connection, actor: User, comment_id: int, emoji: str) -> dict:
    db.execute("DELETE FROM reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?",
               (comment_id, actor.id, emoji))
    return get(db, comment_id)


def update(db: sqlite3.Connection, actor: User, comment_id: int, body: str) -> dict:
    comment = get(db, comment_id)
    if comment["author_id"] != actor.id and not actor.is_admin:
        raise Forbidden("not your comment")
    db.execute("UPDATE comments SET body = ? WHERE id = ?", (body, comment_id))
    return get(db, comment_id)


def delete(db: sqlite3.Connection, actor: User, comment_id: int) -> None:
    comment = get(db, comment_id)
    if comment["author_id"] != actor.id and not actor.is_admin:
        raise Forbidden("not your comment")
    db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
