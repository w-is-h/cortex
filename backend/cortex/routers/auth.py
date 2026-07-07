import sqlite3

from fastapi import APIRouter, Depends, Request, Response

from .. import auth
from ..db import get_db
from ..errors import NotFound, Unauthorized
from ..models import ApiKeyCreate, ApiKeyCreated, ApiKeyOut, LoginIn, TaskOut, UserOut
from ..services import tasks, users

router = APIRouter(prefix="/api")


@router.post("/auth/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: sqlite3.Connection = Depends(get_db)):
    user = users.get_by_username(db, body.username)
    if user is None or not user["is_active"]:
        raise Unauthorized("unknown username")
    token = auth.create_session(db, user["id"])
    response.set_cookie(
        auth.SESSION_COOKIE, token,
        max_age=auth.SESSION_DAYS * 86400,
        httponly=True, samesite="lax", path="/",
    )
    return user


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: sqlite3.Connection = Depends(get_db)):
    token = request.cookies.get(auth.SESSION_COOKIE)
    if token:
        auth.delete_session(db, token)
    response.delete_cookie(auth.SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/auth/me", response_model=UserOut)
def me(user: auth.User = Depends(auth.require_user),
       db: sqlite3.Connection = Depends(get_db)):
    return users.get(db, user.id)


@router.get("/me/tasks", response_model=list[TaskOut])
def my_tasks(user: auth.User = Depends(auth.require_user),
             db: sqlite3.Connection = Depends(get_db)):
    """Home view: my unfinished tasks + my tasks in current sprints."""
    return tasks.my_tasks(db, user.id)


@router.post("/me/api-keys", response_model=ApiKeyCreated)
def create_api_key(body: ApiKeyCreate,
                   user: auth.User = Depends(auth.require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    row, key = auth.create_api_key(db, user.id, body.name)
    return {**row, "key": key}


@router.get("/me/api-keys", response_model=list[ApiKeyOut])
def list_api_keys(user: auth.User = Depends(auth.require_user),
                  db: sqlite3.Connection = Depends(get_db)):
    return [dict(r) for r in db.execute(
        "SELECT * FROM api_keys WHERE user_id = ? ORDER BY created_at DESC", (user.id,))]


@router.delete("/me/api-keys/{key_id}")
def revoke_api_key(key_id: int,
                   user: auth.User = Depends(auth.require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", (key_id, user.id))
    if cur.rowcount == 0:
        raise NotFound("API key not found")
    return {"ok": True}
