import re
import sqlite3

from ..auth import User, now

# chars a bare @token may contain; a username match must not be followed by
# one, so '@ann' doesn't fire inside '@annika'
TOKEN_CHARS = "A-Za-z0-9_.-"


def notify(db: sqlite3.Connection, user_id: int | None, type_: str, actor: User,
           task_id: int | None = None, project_id: int | None = None,
           comment_id: int | None = None) -> None:
    if user_id is None or user_id == actor.id:
        return
    db.execute(
        """INSERT INTO notifications (user_id, type, actor_id, task_id, project_id,
               comment_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (user_id, type_, actor.id, task_id, project_id, comment_id, now()),
    )


def mentioned_user_ids(db: sqlite3.Connection, text: str) -> set[int]:
    """Usernames may contain spaces, so match each known @username against the
    text rather than tokenizing the text."""
    if not text or "@" not in text:
        return set()
    ids = set()
    for row in db.execute("SELECT id, username FROM users"):
        pattern = f"@{re.escape(row['username'])}(?![{TOKEN_CHARS}])"
        if re.search(pattern, text, re.IGNORECASE):
            ids.add(row["id"])
    return ids


def notify_mentions(db: sqlite3.Connection, actor: User, text: str,
                    old_text: str = "", task_id: int | None = None,
                    project_id: int | None = None, comment_id: int | None = None) -> None:
    fresh = mentioned_user_ids(db, text) - mentioned_user_ids(db, old_text)
    for user_id in fresh:
        notify(db, user_id, "mentioned", actor,
               task_id=task_id, project_id=project_id, comment_id=comment_id)


def list_for_user(db: sqlite3.Connection, user_id: int, limit: int = 50) -> dict:
    rows = db.execute(
        """SELECT n.*, u.username AS actor_username,
                  t.title AS task_title, p.title AS project_title
           FROM notifications n
           JOIN users u ON u.id = n.actor_id
           LEFT JOIN tasks t ON t.id = n.task_id
           LEFT JOIN projects p ON p.id = n.project_id
           WHERE n.user_id = ?
           ORDER BY n.created_at DESC, n.id DESC LIMIT ?""",
        (user_id, limit),
    )
    unread = db.execute(
        "SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL",
        (user_id,),
    ).fetchone()[0]
    return {"items": [dict(r) for r in rows], "unread": unread}


def mark_read(db: sqlite3.Connection, user_id: int, ids: list[int] | None = None) -> None:
    if ids is None:
        db.execute("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL",
                   (now(), user_id))
    else:
        placeholders = ",".join("?" * len(ids))
        db.execute(
            f"UPDATE notifications SET read_at = ? WHERE user_id = ? AND id IN ({placeholders})",
            (now(), user_id, *ids),
        )
