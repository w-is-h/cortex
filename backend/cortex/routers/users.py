import sqlite3

from fastapi import APIRouter, Depends

from ..auth import User, require_admin, require_user
from ..db import get_db
from ..models import UserCreate, UserOut, UserUpdate
from ..services import users

router = APIRouter(prefix="/api/users")


@router.get("", response_model=list[UserOut])
def list_users(user: User = Depends(require_user),
               db: sqlite3.Connection = Depends(get_db)):
    return users.list_users(db)


@router.post("", response_model=UserOut)
def create_user(body: UserCreate,
                admin: User = Depends(require_admin),
                db: sqlite3.Connection = Depends(get_db)):
    return users.create(db, body.username, body.is_admin)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate,
                admin: User = Depends(require_admin),
                db: sqlite3.Connection = Depends(get_db)):
    return users.update(db, user_id, is_admin=body.is_admin, is_active=body.is_active)
