"""Session + API-key authentication."""

import hashlib
import secrets
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, Request

from .db import get_db
from .errors import Forbidden, Unauthorized

SESSION_COOKIE = "cortex_session"
SESSION_DAYS = 30
KEY_PREFIX = "ck_"


@dataclass
class User:
    id: int
    username: str
    is_admin: bool


def now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S")


def _ts(days_from_now: int) -> str:
    return (datetime.now(UTC) + timedelta(days=days_from_now)).strftime("%Y-%m-%d %H:%M:%S")


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def create_session(db: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now(), _ts(SESSION_DAYS)),
    )
    return token


def delete_session(db: sqlite3.Connection, token: str) -> None:
    db.execute("DELETE FROM sessions WHERE token = ?", (token,))


def create_api_key(db: sqlite3.Connection, user_id: int, name: str) -> tuple[dict, str]:
    key = KEY_PREFIX + secrets.token_urlsafe(32)
    cur = db.execute(
        "INSERT INTO api_keys (user_id, name, key_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, name, hash_key(key), key[:8], now()),
    )
    row = db.execute("SELECT * FROM api_keys WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row), key


def resolve_user(db: sqlite3.Connection, request: Request) -> User:
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer " + KEY_PREFIX):
        row = db.execute(
            """SELECT u.id, u.username, u.is_admin FROM api_keys k
               JOIN users u ON u.id = k.user_id
               WHERE k.key_hash = ? AND u.is_active = 1""",
            (hash_key(auth.removeprefix("Bearer ")),),
        ).fetchone()
        if row is None:
            raise Unauthorized("invalid API key")
        db.execute("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?",
                   (now(), hash_key(auth.removeprefix("Bearer "))))
        return User(row["id"], row["username"], bool(row["is_admin"]))

    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = db.execute(
            """SELECT u.id, u.username, u.is_admin FROM sessions s
               JOIN users u ON u.id = s.user_id
               WHERE s.token = ? AND s.expires_at > ? AND u.is_active = 1""",
            (token, now()),
        ).fetchone()
        if row is not None:
            # sliding expiry
            db.execute("UPDATE sessions SET expires_at = ? WHERE token = ?",
                       (_ts(SESSION_DAYS), token))
            return User(row["id"], row["username"], bool(row["is_admin"]))

    raise Unauthorized("not authenticated")


def require_user(request: Request, db: sqlite3.Connection = Depends(get_db)) -> User:
    return resolve_user(db, request)


def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise Forbidden("admin only")
    return user
