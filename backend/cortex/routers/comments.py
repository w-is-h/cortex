import sqlite3

from fastapi import APIRouter, Depends

from ..auth import User, require_user
from ..db import get_db
from ..models import CommentCreate, CommentOut
from ..services import comments

router = APIRouter(prefix="/api/comments")


@router.patch("/{comment_id}", response_model=CommentOut)
def update_comment(comment_id: int, body: CommentCreate, user: User = Depends(require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    return comments.update(db, user, comment_id, body.body)


@router.delete("/{comment_id}")
def delete_comment(comment_id: int, user: User = Depends(require_user),
                   db: sqlite3.Connection = Depends(get_db)):
    comments.delete(db, user, comment_id)
    return {"ok": True}


@router.put("/{comment_id}/reactions/{emoji}", response_model=CommentOut)
def add_reaction(comment_id: int, emoji: str, user: User = Depends(require_user),
                 db: sqlite3.Connection = Depends(get_db)):
    return comments.add_reaction(db, user, comment_id, emoji)


@router.delete("/{comment_id}/reactions/{emoji}", response_model=CommentOut)
def remove_reaction(comment_id: int, emoji: str, user: User = Depends(require_user),
                    db: sqlite3.Connection = Depends(get_db)):
    return comments.remove_reaction(db, user, comment_id, emoji)
