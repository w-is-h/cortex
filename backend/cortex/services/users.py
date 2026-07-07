"""User management."""

import sqlite3

from ..auth import now
from ..errors import Conflict, NotFound


def list_users(db: sqlite3.Connection) -> list[dict]:
    return [dict(r) for r in db.execute("SELECT * FROM users ORDER BY username")]


def get(db: sqlite3.Connection, user_id: int) -> dict:
    row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    if row is None:
        raise NotFound("user not found")
    return dict(row)


def create(db: sqlite3.Connection, username: str, is_admin: bool = False) -> dict:
    username = username.strip()
    if not username:
        raise Conflict("username must not be empty")
    try:
        cur = db.execute(
            "INSERT INTO users (username, is_admin, created_at) VALUES (?, ?, ?)",
            (username, int(is_admin), now()),
        )
    except sqlite3.IntegrityError:
        raise Conflict(f"username '{username}' already exists")
    return get(db, cur.lastrowid)


def update(db: sqlite3.Connection, user_id: int,
           is_admin: bool | None = None, is_active: bool | None = None) -> dict:
    get(db, user_id)
    if is_admin is not None:
        db.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), user_id))
    if is_active is not None:
        db.execute("UPDATE users SET is_active = ? WHERE id = ?", (int(is_active), user_id))
        if not is_active:
            db.execute("DELETE FROM sessions WHERE user_id = ?", (user_id,))
    return get(db, user_id)


def get_by_username(db: sqlite3.Connection, username: str) -> dict | None:
    row = db.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
    return dict(row) if row else None
